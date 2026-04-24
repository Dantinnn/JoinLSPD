import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/User.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1497299458608857258";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "suo0O-ifLxxqli5ichwQc9QiYXVYXmFs";
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "https://join-lspd.figma.site/auth/discord/callback";
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 3000;

// Conectar ao MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log("🔗 Conectado ao MongoDB"))
  .catch(err => console.error("❌ Erro ao conectar MongoDB:", err));

app.post("/auth/discord", async (req, res) => {
  const { code } = req.body;

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      throw new Error("Falha ao obter token de acesso");
    }

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const discordUser = await userRes.json();

    if (!discordUser.id) {
      throw new Error("Falha ao obter dados do usuário Discord");
    }

    // Salvar ou atualizar usuário no banco
    const user = await User.findOneAndUpdate(
      { discordId: discordUser.id },
      {
        username: discordUser.username,
        discriminator: discordUser.discriminator || '0',
        avatar: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
        email: discordUser.email || null,
        lastLogin: new Date(),
        isActive: true
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    // Retornar dados do usuário (sem dados sensíveis)
    const userData = {
      id: user.discordId,
      discordId: user.discordId,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      joinedAt: user.joinedAt,
      profile: user.profile
    };

    res.json(userData);

  } catch (err) {
    console.error("Discord Auth Error:", err);
    res.status(500).json({ error: "Erro no login Discord" });
  }
});

// Rota para obter perfil do usuário
app.get("/api/profile/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ discordId: userId });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    res.json({
      id: user.discordId,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      joinedAt: user.joinedAt,
      lastLogin: user.lastLogin,
      profile: user.profile,
      applications: user.applications
    });
  } catch (err) {
    console.error("Profile Error:", err);
    res.status(500).json({ error: "Erro ao buscar perfil" });
  }
});

// Rota para atualizar perfil do usuário
app.put("/api/profile/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    // Permitir apenas updates seguros do perfil
    const allowedUpdates = {
      'profile.bio': updates.bio,
      'profile.rank': updates.rank,
      'profile.badge': updates.badge,
      'profile.preferences.theme': updates.theme,
      'profile.preferences.notifications': updates.notifications
    };

    // Remover campos undefined
    Object.keys(allowedUpdates).forEach(key => {
      if (allowedUpdates[key] === undefined) {
        delete allowedUpdates[key];
      }
    });

    const user = await User.findOneAndUpdate(
      { discordId: userId },
      allowedUpdates,
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    res.json({
      id: user.discordId,
      username: user.username,
      profile: user.profile
    });
  } catch (err) {
    console.error("Profile Update Error:", err);
    res.status(500).json({ error: "Erro ao atualizar perfil" });
  }
});

// Rota para listar todos os usuários (apenas para admin)
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({ isActive: true })
      .select('discordId username discriminator avatar joinedAt profile.rank')
      .sort({ joinedAt: -1 });

    res.json(users);
  } catch (err) {
    console.error("Users List Error:", err);
    res.status(500).json({ error: "Erro ao listar usuários" });
  }
});

app.listen(PORT, () =>
  console.log(`🔥 Backend rodando em porta ${PORT}`)
);

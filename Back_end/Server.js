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

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "https://join-lspd.figma.site/auth/discord/callback";
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 3000;

// Validar MONGODB_URI
if (!MONGODB_URI) {
  console.error("❌ ERRO CRÍTICO: MONGODB_URI não está definida!");
  console.error("   Defina a variável de ambiente MONGODB_URI");
  process.exit(1);
}

// Conectar ao MongoDB
await mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ 🔗 Conectado ao MongoDB"))
  .catch(err => {
    console.error("❌ Erro ao conectar MongoDB:", err.message);
    process.exit(1);
  });

app.post("/auth/discord", async (req, res) => {
  const { code } = req.body;

  try {
    if (!code) {
      return res.status(400).json({ error: "Código de autenticação não fornecido" });
    }

    console.log("🔑 Iniciando autenticação Discord com código:", code.substring(0, 10) + "...");

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
      console.error("❌ Discord não retornou access_token:", tokenData);
      throw new Error("Falha ao obter token de acesso: " + (tokenData.error || "Erro desconhecido"));
    }

    console.log("✅ Access token obtido");

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const discordUser = await userRes.json();

    if (!discordUser.id) {
      console.error("❌ Discord não retornou ID do usuário:", discordUser);
      throw new Error("Falha ao obter dados do usuário Discord");
    }

    console.log("✅ Dados do Discord obtidos:", discordUser.username, discordUser.id);

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

    console.log("✅ Usuário salvo no banco:", {
      discordId: user.discordId,
      username: user.username,
      _id: user._id
    });

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

    console.log("📤 Enviando ao frontend:", userData);

    res.json(userData);

  } catch (err) {
    console.error("❌ Discord Auth Error:", err.message);
    console.error("   Stack:", err.stack);
    res.status(500).json({ error: err.message || "Erro no login Discord" });
  }
});

// Rota para obter perfil do usuário
app.get("/api/profile/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    console.log("🔍 GET /api/profile/:userId =", userId);

    if (!userId) {
      console.warn("⚠️ Requisição sem userId");
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    const user = await User.findOne({ discordId: userId });

    if (!user) {
      console.warn("❌ Usuário não encontrado para discordId:", userId);
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    console.log("✅ Usuário encontrado:", user.username, user.discordId);

    const profileResponse = {
      id: user.discordId,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      joinedAt: user.joinedAt,
      lastLogin: user.lastLogin,
      profile: user.profile,
      applications: user.applications
    };

    console.log("📤 Retornando perfil");

    res.json(profileResponse);
  } catch (err) {
    console.error("❌ Profile Error:", err.message);
    console.error("   Stack:", err.stack);
    res.status(500).json({ error: "Erro ao buscar perfil: " + err.message });
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

import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/User.js";
import Academy from "./models/Academy.js";
import Application from "./models/Application.js";

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

// Middleware para verificar se é admin
const requireAdmin = async (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "Usuário não autenticado" });
  const user = await User.findOne({ discordId: userId });
  if (!user || user.profile.rank !== 'Comandante') return res.status(403).json({ error: "Acesso negado" });
  req.user = user;
  next();
};

const requireUser = async (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "Usuário não autenticado" });
  const user = await User.findOne({ discordId: userId });
  if (!user) return res.status(401).json({ error: "Usuário não encontrado" });
  req.user = user;
  next();
};

// Rotas para Academias
// Listar academias abertas (para usuários)
app.get("/api/academies/open", async (req, res) => {
  try {
    const now = new Date();
    const academies = await Academy.find({
      isOpen: true,
      $and: [
        {
          $or: [
            { startDate: null },
            { startDate: { $lte: now } }
          ]
        },
        {
          $or: [
            { endDate: null },
            { endDate: { $gte: now } }
          ]
        }
      ]
    }).select('name description vacancies startDate endDate documents isOpen');
    res.json(academies);
  } catch (err) {
    console.error("Academies Open Error:", err);
    res.status(500).json({ error: "Erro ao buscar academias" });
  }
});

// Listar todas as academias (para admin)
app.get("/api/academies", requireAdmin, async (req, res) => {
  try {
    const academies = await Academy.find().populate('createdBy', 'username').sort({ createdAt: -1 });
    res.json(academies);
  } catch (err) {
    console.error("Academies List Error:", err);
    res.status(500).json({ error: "Erro ao listar academias" });
  }
});

// Criar academia (admin)
app.post("/api/academies", requireAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      vacancies = 0,
      startDate,
      endDate,
      documents = [],
      isOpen = false
    } = req.body;

    const academy = new Academy({
      name,
      description,
      vacancies,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      documents,
      isOpen,
      createdBy: req.user._id,
      openedAt: isOpen ? new Date() : null,
      closedAt: isOpen ? null : new Date()
    });

    await academy.save();
    res.status(201).json(academy);
  } catch (err) {
    console.error("Create Academy Error:", err);
    res.status(500).json({ error: "Erro ao criar academia" });
  }
});

// Atualizar academia (admin)
app.put("/api/academies/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      vacancies,
      startDate,
      endDate,
      documents,
      isOpen
    } = req.body;

    const update = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (vacancies !== undefined) update.vacancies = vacancies;
    if (startDate !== undefined) update.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) update.endDate = endDate ? new Date(endDate) : null;
    if (documents !== undefined) update.documents = documents;
    if (isOpen !== undefined) {
      update.isOpen = isOpen;
      if (isOpen) {
        update.openedAt = new Date();
        update.closedAt = null;
      } else {
        update.closedAt = new Date();
      }
    }

    const academy = await Academy.findByIdAndUpdate(id, update, { new: true });
    if (!academy) return res.status(404).json({ error: "Academia não encontrada" });
    res.json(academy);
  } catch (err) {
    console.error("Update Academy Error:", err);
    res.status(500).json({ error: "Erro ao atualizar academia" });
  }
});

// Rota para submeter aplicação
app.post("/api/applications", async (req, res) => {
  try {
    const { userId, academyId, formData } = req.body;
    const user = await User.findOne({ discordId: userId });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    const academy = await Academy.findById(academyId);
    if (!academy || !academy.isOpen) return res.status(400).json({ error: "Academia não está aberta" });

    const alreadyApplied = await Application.findOne({
      user: user._id,
      academy: academy._id,
      status: { $in: ['pending', 'approved'] }
    });
    if (alreadyApplied) {
      return res.status(400).json({ error: "Você já possui uma candidatura ativa para esta academia" });
    }

    const application = new Application({
      user: user._id,
      academy: academy._id,
      formData,
    });
    await application.save();

    user.applications.push({
      applicationId: application._id,
      status: application.status,
      submittedAt: application.submittedAt
    });
    await user.save();

    const webhookUrl = "https://discord.com/api/webhooks/1497229096881754123/Vg-wCpBM9RpcX8vECCZnZLSJBOYxlar5wMteb1c48W9QWtfOzvsA0wumNqOCkIMktF9E";

    const embed = {
      embeds: [
        {
          title: `📋 Nova Candidatura - ${academy.name}`,
          color: 2563563,
          description:
            `👤 **Nome:**\n${formData.nome}\n\n` +
            `🎂 **Idade:**\n${formData.idade}\n\n` +
            `💬 **Discord:**\n${user.username} (${user.discordId})\n\n` +
            `📋 **Copiar ID:**\nhttps://copy-text.vercel.app/?text=${user.discordId}\n\n` +
            `💭 **Motivação:**\n${formData.motivacao}\n\n` +
            `⏰ **Disponibilidade:**\n${formData.disponibilidade}\n\n` +
            `⚖️ **Leis Americanas:**\n${formData.conhecimentoLeis}\n\n` +
            `🎯 **Situação:**\n${formData.situacaoExemplo}\n\n` +
            `📄 **Documentos:**\n${formData.documentos || 'Nenhum'}`,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(embed),
    });

    res.status(201).json({ message: "Candidatura enviada com sucesso", applicationId: application._id });
  } catch (err) {
    console.error("Application Submit Error:", err);
    res.status(500).json({ error: "Erro ao enviar candidatura" });
  }
});

// Listar aplicações de um usuário
app.get("/api/applications/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ discordId: userId });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    const applications = await Application.find({ user: user._id })
      .populate('academy', 'name description vacancies startDate endDate isOpen')
      .sort({ submittedAt: -1 });

    res.json(applications);
  } catch (err) {
    console.error("User Applications Error:", err);
    res.status(500).json({ error: "Erro ao listar aplicações" });
  }
});

// Listar todas as aplicações (admin)
app.get("/api/applications", requireAdmin, async (req, res) => {
  try {
    const applications = await Application.find()
      .populate('academy', 'name description vacancies startDate endDate isOpen')
      .populate('user', 'username discordId')
      .sort({ submittedAt: -1 });

    res.json(applications);
  } catch (err) {
    console.error("Applications List Error:", err);
    res.status(500).json({ error: "Erro ao listar aplicações" });
  }
});

app.get("/api/applications/:id", requireUser, async (req, res) => {
  try {
    const { id } = req.params;
    const application = await Application.findById(id)
      .populate('academy', 'name description vacancies startDate endDate isOpen')
      .populate('user', 'username discordId');

    if (!application) return res.status(404).json({ error: "Aplicação não encontrada" });

    if (req.user.profile.rank !== 'Comandante' && !application.user._id.equals(req.user._id)) {
      return res.status(403).json({ error: "Acesso negado" });
    }

    res.json(application);
  } catch (err) {
    console.error("Application Detail Error:", err);
    res.status(500).json({ error: "Erro ao buscar aplicação" });
  }
});

// Atualizar status da aplicação (admin)
app.put("/api/applications/:id/status", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "Status inválido" });
    }

    const application = await Application.findById(id);
    if (!application) return res.status(404).json({ error: "Aplicação não encontrada" });

    application.status = status;
    await application.save();

    await User.updateOne(
      { 'applications.applicationId': application._id },
      { $set: { 'applications.$.status': status } }
    );

    res.json(application);
  } catch (err) {
    console.error("Application Status Error:", err);
    res.status(500).json({ error: "Erro ao atualizar status da aplicação" });
  }
});

// Enviar mensagem na aplicação (user/admin)
app.post("/api/applications/:id/messages", requireUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const application = await Application.findById(id).populate('user', 'discordId');
    if (!application) return res.status(404).json({ error: "Aplicação não encontrada" });

    const isAdmin = req.user.profile.rank === 'Comandante';
    const isOwner = application.user._id.equals(req.user._id);
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: "Acesso negado" });
    }

    application.messages.push({
      authorId: req.user._id,
      authorName: req.user.username,
      authorRole: isAdmin ? 'admin' : 'user',
      content,
      createdAt: new Date()
    });

    await application.save();
    res.json(application);
  } catch (err) {
    console.error("Application Message Error:", err);
    res.status(500).json({ error: "Erro ao enviar mensagem" });
  }
});

app.listen(PORT, () =>
  console.log(`🔥 Backend rodando em porta ${PORT}`)
);

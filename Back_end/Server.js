import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1497299458608857258";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "suo0O-ifLxxqli5ichwQc9QiYXVYXmFs";
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "https://join-lspd.figma.site/auth/discord/callback";
const PORT = process.env.PORT || 3000;

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

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const user = await userRes.json();

    res.json({
      id: user.id,
      username: user.username,
      avatar: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`,
    });

  } catch (err) {
    console.error("Discord Auth Error:", err);
    res.status(500).json({ error: "Erro no login Discord" });
  }
});

app.listen(PORT, () =>
  console.log(`🔥 Backend rodando em porta ${PORT}`)
);
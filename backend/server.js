require('dotenv').config();
const cookieParser = require("cookie-parser");
const express = require("express");
const app = express();
const authRoutes = require("./routes/auth");
const cors = require("cors");
const fetch = require('node-fetch');
const db = require("./DataBase/db");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const authenticateToken = require("./middlewares/authenticateToken");
const logger = require('./logger');

const allowedOrigins = [
  "chrome-extension://fhcbgnpgdmeckccdnhhnkpgdemiendbf",
  "https://6yj7l2qc.up.railway.app",
  "https://forsocials.com"
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // allow extensions
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.error("❌ Blocked by CORS:", origin);
    return callback(new Error("CORS not allowed"), false);
  },
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Preflight handler for all routes
// ✅ Correct universal preflight handler for Express v5+
app.options(/.*/, cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS not allowed"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));




app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("⚠️ Webhook signature verification failed:", err.message);
    return res.sendStatus(400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { userId, plan } = session.metadata;

    await db.query(
      "UPDATE users SET subscription_plan = ?, ai_requests_used_last_month = 0, subscription_active = 1 WHERE id = ?",
      [plan, userId]
    );
  }

  res.sendStatus(200);
});

app.use(cookieParser());
app.use(express.json());
app.use("/", authRoutes);

app.post("/createCheckoutSession", authenticateToken, async (req, res) => {
  const { plan } = req.body;
  const user = req.user;

  // Map plans to Stripe price IDs
  const priceMap = {
    starter: "price_1SGescRMU1ty7g0VKoemj8yq",
    pro: "price_1SGeteRMU1ty7g0VPtVVtAmZ",
    power: "price_1SGeu3RMU1ty7g0VgkDaKbep",
    lifetime: "price_1SGeuORMU1ty7g0Veoh99Wj5"
  };

  try {

    const mode = plan === "lifetime" ? "payment" : "subscription";

    const session = await stripe.checkout.sessions.create({
      mode,
      payment_method_types: ["card"],
      line_items: [{ price: priceMap[plan], quantity: 1 }],
      success_url: "https://6yj7l2qc.up.railway.app/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://6yj7l2qc.up.railway.app/cancel",
      metadata: { userId: user.id, plan }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to create Stripe session" });
  }
});

async function callOpenAI(payload, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 429) {
        const waitTime = 2000 * (i + 1); // exponential backoff
        logger.warn(`Rate limit hit. Retrying in ${waitTime}ms...`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      const data = await response.json();
      const requestId = response.headers.get('openai-request-id'); // Track request ID
      return { data, requestId };

    } catch (err) {
      logger.error(err, 'OpenAI request failed');
      if (i === retries - 1) throw err;
    }
  }
}


app.post("/getAiReply", async (req, res) => {

  const { blocks, platform } = req.body;

  if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
    return res.status(400).json({ error: "Invalid input: 'blocks' must be a non-empty array." });
  }

  // ✅ Get user's token
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Missing Authorization header" });

  const token = authHeader.replace("Bearer ", "");

  try {
    // ✅ Fetch user info from your /me route
    const userRes = await fetch("https://6yj7l2qc.up.railway.app/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!userRes.ok) return res.status(401).json({ error: "Invalid token" });
    const user = await userRes.json();

    // ✅ Determine plan limits
    const PLAN_LIMITS = {
      free: 20,
      starter: 500,
      pro: 2500,
      power: 10000,
      lifetime: 2500
    };

    const now = Date.now();

    // --- Free trial check ---
    if (user.subscription_plan === "free") {
      if (!user.trial_start) {
        // Start the trial now
        await db.query("UPDATE users SET trial_start = ? WHERE id = ?", [new Date(), user.id]);
      } else {
        const trialStart = new Date(user.trial_start).getTime();
        const daysElapsed = (now - trialStart) / (1000 * 60 * 60 * 24);
        if (daysElapsed > 3) {
          return res.status(403).json({ error: "Free trial expired. Please upgrade." });
        }
      }
    }

    // --- Check AI request usage ---
    const [countResult] = await db.query(
      `SELECT COUNT(*) as used
      FROM ai_request_logs
      WHERE user_id = ?
        AND MONTH(created_at) = MONTH(CURDATE())
        AND YEAR(created_at) = YEAR(CURDATE())`,
      [user.id]
    );
    const usedRequests = countResult[0].used;

    if (usedRequests >= PLAN_LIMITS[user.subscription_plan]) {
      return res.status(403).json({ error: "AI request limit reached for your plan. Please upgrade." });
    }

    // --- Call OpenAI API ---
    const messages = `  You are a human leaving comments on social media posts. Your whole philosophy is Less IS More. Your replies should be super short, sharp, natural, and human — never robotic. Avoid generic phrases and trying to make everyone happy. Be sassy. Don’t mirror the original post or simply observe it. Instead, come in with fresh, clever, or insightful takes that feel like something a smart, witty person would say in a conversation.
                    Generate three different replies to the post below, each with a distinct tone:

                    1. Casual/Chill: playful, witty, friendly.
                    2. Business/Professional: concise, insightful, clear, no mirroring, no observing, very short take.
                    3. Gentle Disagreement: polite, thoughtful pushback, no mirroring, no observing, very short take.

                    Keep replies short (1–2 sentences), natural, and without emojis. Less is more.
                    Do not label the replies by their tones — just output the replies as plain text. And never put numbers in front, like: (1. 2. 3.)`;




    const userContent = blocks.map(b => {
      if (b.type === "text") return { type: "text", text: b.text };
      if (b.type === "image_url") {
        // handle both formats
        return { type: "image_url", image_url: { url: b.image_url?.url || b.url } };
      }
      return null;
    }).filter(Boolean);

    const { data, requestId } = await callOpenAI({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: messages },
        { role: "user", content: userContent }
      ],
      n: 1
    });

    logger.info({
      userId: user.id,
      plan: user.subscription_plan,
      platform,
      requestId: data?.id, // OpenAI request ID
    }, 'AI request logged successfully');

    // --- Log this request ---
    await db.query("INSERT INTO ai_request_logs (user_id, platform) VALUES (?, ?)", [user.id, platform]);

    try {
      await db.query(
        "UPDATE users SET ai_requests_used = COALESCE(ai_requests_used, 0) + 1 WHERE id = ?",
        [user.id]
      );
    } catch (e) {
      console.error("Failed to update ai_requests_used:", e);
    }

    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI request failed" });
  }

});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

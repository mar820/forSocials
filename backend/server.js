require('dotenv').config();
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const fetch = require("node-fetch");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const db = require("./DataBase/db");
const authRoutes = require("./routes/auth");
const authenticateToken = require("./middlewares/authenticateToken");
const logger = require("./logger");

const app = express();

// ✅ 1. CORS setup (Express 5 safe)
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "chrome-extension://fhcbgnpgdmeckccdnhhnkpgdemiendbf",
      "https://6yj7l2qc.up.railway.app",
      "https://forsocials.com"
    ];

    if (!origin) return callback(null, true); // allow requests with no origin (extensions, curl, etc.)
    if (allowedOrigins.includes(origin)) return callback(null, true);

    console.error("❌ Blocked by CORS:", origin);
    return callback(new Error("CORS not allowed"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// ✅ 2. Apply global CORS middleware
app.use(cors(corsOptions));

// ✅ 3. Universal OPTIONS handler — Express 5 safe version
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Credentials", "true");
    return res.sendStatus(200);
  }
  next();
});

// ✅ 5. Then the rest of your app
app.use(cookieParser());
app.use(express.json());
app.use("/", authRoutes);

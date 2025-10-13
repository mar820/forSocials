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

// ✅ 1. Define allowed origins
const allowedOrigins = [
  "chrome-extension://fhcbgnpgdmeckccdnhhnkpgdemiendbf",
  "https://6yj7l2qc.up.railway.app",
  "https://forsocials.com"
];

// ✅ 2. Enable CORS globally before anything else
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // allow extension + curl
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.error("❌ Blocked by CORS:", origin);
    return callback(new Error("CORS not allowed"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ✅ 3. Handle preflight for all routes
app.options("/.*/", cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ✅ 4. Global fallback to add headers even on thrown errors
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

// ✅ 5. Then the rest of your app
app.use(cookieParser());
app.use(express.json());
app.use("/", authRoutes);

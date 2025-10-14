const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = require("../DataBase/db");
const { Resend } = require("resend");
const jwt = require("jsonwebtoken");
const authenticateToken = require("../middlewares/authenticateToken");

const resend = new Resend(process.env.RESEND_API_KEY);

router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ Check if user exists
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length > 0)
      return res.status(400).json({ message: "Email already registered" });

    // 2️⃣ Hash password
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    // 3️⃣ Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // 4️⃣ Set trial_start to now for free trial
    const trialStart = new Date();

    // 5️⃣ Insert user into DB
    await db.query(
      `INSERT INTO users
       (email, password_hash, verification_token, subscription_plan, trial_start, ai_requests_used)
       VALUES (?, ?, ?, 'free', ?, 0)`,
      [email, hash, verificationToken, trialStart]
    );

    // 6️⃣ Send verification email
    const verificationLink = `https://forsocials.com/verify?token=${verificationToken}`;

    try {
      await resend.emails.send({
        from: "ReplyRiser <noreply@forsocials.com>", // You can change this
        to: email,
        subject: "Verify your email",
        html: `<p>Click <a href="${verificationLink}">here</a> to verify your email.</p>`
      });
      console.log(`✅ Verification email sent to ${email}`);
    } catch (emailError) {
      console.error("❌ Failed to send verification email:", emailError);
    }

    res.status(201).json({
      message: "Signup successful! Check your email to verify your account."
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});



router.get("/verify", async (req, res) => {
  try {
    const {token} = req.query;

    const [rows] = await db.query("SELECT * FROM users WHERE verification_token = ?", [token]);
    if (rows.length === 0) return res.status(400).json({message: "Invalid Token"});

    await db.query("UPDATE users SET is_verified = 1, verification_token = NULL WHERE verification_token = ?", [token]);

    res.send("<h2>Email verified successfully! You can now log in.</h2>");
  } catch (error) {
    res.status(500).send("Server error");
  }
})


router.post("/login", async (req, res) => {
  try {
    const {email, password} = req.body;

    const [rows] = await db.query("SELECT * FROM users WHERE email = ? ", [email]);
    if (rows.length === 0) return res.status(400).json({message: "Invalid email address!"});

    const user = rows[0];

    if (!user.is_verified) return res.status(400).json({message: "Please verify your email address!"});

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(400).json({message: "Invalid password"});

    const token = jwt.sign(
      {id: user.id, email: user.email},
      process.env.JWT_TOKEN,
      {expiresIn: "60d"}
    );

    return res.status(200).json({message: "Login successful!", token});

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
})


router.get("/me", authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, email, subscription_plan, trial_start FROM users WHERE id = ?", [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ message: "User not found" });

    const [countResult] = await db.query(
      `SELECT COUNT(*) as used
      FROM ai_request_logs
      WHERE user_id = ?
        AND MONTH(created_at) = MONTH(CURDATE())
        AND YEAR(created_at) = YEAR(CURDATE())`,
      [req.user.id]
    );

    const user = rows[0];

    let timeLeft = null;
    if (user.subscription_plan === "free" && user.trial_start) {
      const now = Date.now();
      const trialStart = new Date(user.trial_start).getTime();
      const msLeft = Math.max(0, (3 * 24 * 60 * 60 * 1000) - (now - trialStart)); // 3 days = 72h = 259200000 ms

      const totalMinutes = Math.floor(msLeft / (1000 * 60));
      const days = Math.floor(totalMinutes / (60 * 24));
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
      const minutes = totalMinutes % 60;

      // Format as DD:HH:MM
      timeLeft = `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    const usedRequests = countResult[0].used;

        res.json({
      ...rows[0],
      ai_requests_used_last_month: usedRequests,  // ✅ send to frontend
      time_left_for_ai_requests: timeLeft
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  });
  res.json({ message: "Logged out successfully." });
});

module.exports = router;

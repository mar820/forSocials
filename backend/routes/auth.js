const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = require("../DataBase/db");
const { Resend } = require("resend");
const jwt = require("jsonwebtoken");
const authenticateToken = require("../middlewares/authenticateToken");
const fs = require("fs");
const path = require("path");


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
    const verificationLink = `https://api.forsocials.com/verify?token=${verificationToken}`;

    let htmlContent = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Verify Your Email</title>
      <style>
        body {
          background: #f8fafc;
          color: #0f172a;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .card {
          background: white;
          border-radius: 16px;
          padding: 40px;
          box-shadow: 0 8px 20px rgba(0,0,0,0.08);
          text-align: center;
          max-width: 400px;
        }
        a.button {
          display: inline-block;
          margin-top: 25px;
          background: #2563eb;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 500;
          transition: background 0.2s;
        }
        a.button:hover {
          background: #1d4ed8;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Welcome to ForSocials!</h2>
        <p>Please verify your email by clicking the button below:</p>
        <a href="{{VERIFICATION_LINK}}" class="button">Verify Email</a>
      </div>
    </body>
    </html>`;

    // Replace placeholder with actual verification link
    htmlContent = htmlContent.replace("{{VERIFICATION_LINK}}", verificationLink);

    // Send email
    await resend.emails.send({
      // from: "ForSocials <noreply@forsocials.com>",
      from: "ForSocials <noreply@api.forsocials.com>",
      to: email,
      subject: "Verify your email",
      html: htmlContent
    });


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

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Email Verified</title>
          <style>
            body {
              background: #f8fafc;
              color: #0f172a;
              font-family: 'Inter', system-ui, -apple-system, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              background: white;
              padding: 40px;
              border-radius: 16px;
              box-shadow: 0 8px 20px rgba(0,0,0,0.08);
              text-align: center;
              max-width: 400px;
            }
            h2 {
              color: #22c55e;
            }
            p {
              margin: 20px 0;
              color: #475569;
            }
            a.button {
              display: inline-block;
              padding: 12px 24px;
              background: #2563eb;
              color: white;
              border-radius: 8px;
              text-decoration: none;
              font-weight: 500;
            }
            a.button:hover {
              background: #1d4ed8;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>✅ Email Verified Successfully!</h2>
            <p>Your account has been verified. You can now log in and start using ForSocials.</p>
          </div>
        </body>
      </html>
    `);
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

    const user = rows[0];

    const sinceDate = user.subscription_plan === "free" && user.trial_start
      ? user.trial_start
      : user.subscription_start || new Date(0);

    const [countResult] = await db.query(
      `SELECT COUNT(*) as used
       FROM ai_request_logs
       WHERE user_id = ? AND created_at >= ?`,
      [user.id, sinceDate]
    );

    const usedRequests = countResult[0].used;
    let remaining = PLAN_LIMITS[user.subscription_plan] - usedRequests;
    remaining = Math.max(0, remaining);

    let timeLeft;

    if (user.subscription_plan === "free") {
      // 🆓 Trial logic
      if (user.trial_start) {
        const now = Date.now();
        const trialStart = new Date(user.trial_start).getTime();
        const msLeft = Math.max(0, (3 * 24 * 60 * 60 * 1000) - (now - trialStart));

        if (msLeft <= 0) {
          remaining = 0;
          timeLeft = "Trial expired — upgrade to continue";
        } else {
          const totalMinutes = Math.floor(msLeft / (1000 * 60));
          const days = Math.floor(totalMinutes / (60 * 24));
          const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
          const minutes = totalMinutes % 60;
          timeLeft = `${days}d ${hours}h ${minutes}m`;
        }
      } else {
        timeLeft = "3d 0h 0m";
      }
    } else {
      // 💳 Paid plan logic
      const now = Date.now();
      const end = user.subscription_end
        ? new Date(user.subscription_end).getTime()
        : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getTime();
      const msLeft = Math.max(0, end - now);

      const days = Math.floor(msLeft / (1000 * 60 * 60 * 24));
      const hours = Math.floor((msLeft / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((msLeft / (1000 * 60)) % 60);
      timeLeft = msLeft > 0 ? `${days}d ${hours}h ${minutes}m` : "Expired";
    }

    res.json({
      ...user,
      ai_requests_used_last_month: usedRequests,
      remaining_ai_requests: remaining,
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

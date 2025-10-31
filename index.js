import express from "express";
import { Spot } from '@binance/connector';
import dotenv from 'dotenv';

import priceRoutes from "./routes/price.js";
import rebalanceRoutes from "./routes/rebalance.js";

dotenv.config();
const app = express();
app.use(express.json());

// --- เพิ่ม middleware ตรวจ dev ---
function parseBooleanVal(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return false; // ไม่สามารถแปลง
}

app.use((req, res, next) => {
  const source = (req.method === 'GET' || req.method === 'DELETE') ? req.query : req.body;
  req.isDev = parseBooleanVal(source?.dev);
  next();
});

// Logger middleware with colors
app.use((req, res, next) => {
  const start = Date.now();

  // ANSI color codes
  const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
  };

  // เลือกสีตาม HTTP method
  let methodColor = colors.white;
  switch (req.method) {
    case "GET":
      methodColor = colors.green;
      break;
    case "POST":
      methodColor = colors.blue;
      break;
    case "PUT":
      methodColor = colors.yellow;
      break;
    case "DELETE":
      methodColor = colors.red;
      break;
    default:
      methodColor = colors.cyan;
  }

  console.log(
    `${colors.bright}${methodColor}--> ${req.method} ${req.originalUrl}${colors.reset} | query=${JSON.stringify(
      req.query
    )} | body=${JSON.stringify(req.body)} | dev=${req.isDev}`
  );

  res.on("finish", () => {
    const duration = Date.now() - start;
    // สีของ status code: 2xx=green, 4xx=yellow, 5xx=red
    let statusColor = colors.white;
    if (res.statusCode >= 500) statusColor = colors.red;
    else if (res.statusCode >= 400) statusColor = colors.yellow;
    else if (res.statusCode >= 200) statusColor = colors.green;

    console.log(
      `${statusColor}<-- ${res.statusCode} ${req.method} ${req.originalUrl} ${duration}ms${colors.reset}`
    );
  });

  next();
});

// ✅ ตั้งค่า Binance API with additional options
const client = new Spot(
  process.env.BINANCE_API_KEY,
  process.env.BINANCE_API_SECRET,
  {
    baseURL: process.env.NODE_ENV === "development"? 'https://testnet.binance.vision' : 'https://api.binance.com',
    recvWindow: 60000, // เพิ่มเวลารอการตอบกลับ
    timeout: 1000 * 60, // timeout 60 วินาที
    httpsAgent: undefined, // ใช้ default https agent
    proxy: false, // ไม่ใช้ proxy
    defaultType: 'SPOT', // default trading type
    logger: {
      debug: (msg) => {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[Binance Debug]:', msg);
        }
      },
      log: (msg) => console.log('[Binance]:', msg),
      warn: (msg) => console.warn('[Binance Warning]:', msg),
      error: (msg) => console.error('[Binance Error]:', msg)
    }
  }
);

// ✅ ผูก router
app.use("/price", priceRoutes(client));
app.use("/rebalance", rebalanceRoutes(client));

// ✅ root route (ไว้ทดสอบ)
app.get("/", (req, res) => {
  console.log("Root route accessed");
  res.send("🚀 Binance API on Cloud Run is running!");
});

// ✅ start server
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`✅ Server started on port ${port}`);
});

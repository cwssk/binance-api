import express from "express";
import Binance from "node-binance-api";

const app = express();
app.use(express.json());

// ✅ ตั้งค่า Binance API (ใส่ key จริงผ่าน environment variable)
const binance = new Binance().options({
  APIKEY: process.env.BINANCE_API_KEY,
  APISECRET: process.env.BINANCE_API_SECRET,
  recvWindow: 60000, // กัน timeout
});

// ✅ ตัวอย่าง endpoint: ดึงราคาล่าสุดของคู่เหรียญ
app.get("/price/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const ticker = await binance.prices(symbol);
    res.json({ symbol, price: ticker[symbol] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ root route (ไว้ทดสอบ)
app.get("/", (req, res) => {
  res.send("🚀 Binance API on Cloud Run is running!");
});

// ✅ start server
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`✅ Server started on port ${port}`);
});

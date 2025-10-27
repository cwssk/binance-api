import express from "express";

export default function (binance) {
  const router = express.Router();

  // GET /price/:symbol
  router.get("/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const ticker = await binance.prices(symbol);
      console.log(`Price fetched for ${symbol}: ${ticker[symbol]}`);
      res.json({ symbol, price: ticker[symbol] });
    } catch (error) {
      console.error("Price fetch error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

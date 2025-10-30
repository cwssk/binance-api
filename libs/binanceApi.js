export async function callBinanceAPI(client, method, endpoint, params = {}) {
  try {
    const response = await client.signRequest(
      method,
      endpoint,
      params
    );
    return response.data;
  } catch (error) {
    console.error(`Error calling ${endpoint}:`, error.response?.data || error.message);
    throw error;
  }
}

export async function getFlexibleProducts(client, asset = null) {
  try {
    const params = {};
    if (asset) {
      params.asset = asset;
    }
    
    const result = await callBinanceAPI(
      client,
      'GET',
      '/sapi/v1/simple-earn/flexible/list',
      params
    );
    
    return result;
  } catch (error) {
    console.error('Error getting products:', error);
    throw error;
  }
}

export async function redeemFlexibleSavings(client, productId, amount = null, redeemType = 'FAST') {
  try {
    const params = {
      productId: productId,
      redeemType: redeemType
    };
    
    if (amount !== null) {
      params.amount = amount.toString();
    }
    
    const result = await callBinanceAPI(
      client,
      'POST',
      '/sapi/v1/simple-earn/flexible/redeem',
      params
    );
    
    console.log('✅ Redemption successful:', result);
    return result;
  } catch (error) {
    console.error('❌ Error redeeming:', error);
    throw error;
  }
}

/**
 * Place a market buy order
 * @param {object} client - Binance API client
 * @param {string} symbol - Trading pair symbol e.g. 'BTCUSDT'
 * @param {number} quantity - Amount to buy in quote currency (e.g. USDT)
 */
export async function marketBuy(client, symbol, quantity) {
  try {
    const params = {
      symbol: symbol.toUpperCase(),
      quoteOrderQty: quantity.toString(),
      type: 'MARKET',
      side: 'BUY'
    };

    const result = await callBinanceAPI(
      client, 
      'POST',
      '/api/v3/order',
      params
    );

    console.log('✅ Market buy order placed:', result);
    return result;
  } catch (error) {
    console.error('❌ Error placing market buy order:', error);
    throw error;
  }
}

/**
 * Place a market sell order
 * @param {object} client - Binance API client
 * @param {string} symbol - Trading pair symbol e.g. 'BTCUSDT'  
 * @param {number} quantity - Amount to sell in base currency (e.g. BTC)
 */
export async function marketSell(client, symbol, quantity) {
  try {
    const params = {
      symbol: symbol.toUpperCase(),
      quantity: quantity.toString(),
      type: 'MARKET',
      side: 'SELL'
    };

    const result = await callBinanceAPI(
      client,
      'POST',
      '/api/v3/order',
      params
    );

    console.log('✅ Market sell order placed:', result);
    return result;
  } catch (error) {
    console.error('❌ Error placing market sell order:', error);
    throw error;
  }
}

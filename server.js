import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  order_id: String,
  payment_id: Number,
  name: String,
  email: String,
  phone: String,
  address: String,
  city: String,
  zipCode: String,
  items: Array,
  amount: Number,
  status: String,
  date: String,
});

const Order = mongoose.model("Order", orderSchema);

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Test básico
app.get("/", (req, res) => {
  res.json({ message: "Servidor corriendo correctamente" });
});

// ===== TEST DE PAGO =====
app.get("/test-payment", async (req, res) => {
  try {
    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        items: [
          {
            title: "Producto de prueba",
            quantity: 1,
            currency_id: "COP",
            unit_price: 10000,
          },
        ],
      }),
    });

    const data = await response.json();

    res.send(`
      <h1>Preferencia creada</h1>
      <a href="${data.init_point}" target="_blank">Pagar con MercadoPago</a>
    `);
  } catch (error) {
    console.error(error);
    res.send("Error creando preferencia");
  }
});

// ===== CREAR PAGO REAL =====
app.post("/create-preference", async (req, res) => {
  try {
    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        items: req.body.items,
        metadata: {
          customer: req.body.customer
        },

        notification_url: "https://vibewear-server-w0z2.onrender.com/webhook",

        back_urls: {
          success: "https://ytzjakdiaz.github.io/VibeWear/files/success.html",
          failure: "https://ytzjakdiaz.github.io/VibeWear/files/failure.html",
          pending: "https://ytzjakdiaz.github.io/VibeWear/files/pending.html",
        },
        auto_return: "approved",
      }),
    });

    const data = await response.json();

    console.log("Respuesta MercadoPago:");
    console.log(data);

    if (!data.init_point) {
      return res.status(400).json({
        error: "MercadoPago error",
        details: data,
      });
    }

    res.json({ init_point: data.init_point });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error creando preferencia" });
  }
});

// ===== CONEXIÓN A MONGODB =====
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("🟢 MongoDB conectado"))
  .catch((err) => console.log("🔴 Error MongoDB:", err));

// ===== WEBHOOK MERCADOPAGO =====
app.post("/webhook", async (req, res) => {
  try {
    console.log("🔔 WEBHOOK RECIBIDO");
    console.log(req.body);
    console.log("🧠 METADATA:", order.metadata);

    const merchantOrderId = req.body?.id;
    if (!merchantOrderId) return res.sendStatus(200);

    // Obtener orden
    const response = await fetch(
      `https://api.mercadopago.com/merchant_orders/${merchantOrderId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        },
      }
    );

    const order = await response.json();
    const customer = order.metadata?.customer || {};

    console.log("📦 ORDEN MERCADOPAGO:");
    console.log(order);

    if (order.payments && order.payments.length > 0) {
      const paymentId = order.payments[0].id;

      // Obtener pago real
      const paymentRes = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          },
        }
      );

      const payment = await paymentRes.json();

      console.log("💰 PAGO DETALLE:");
      console.log(payment.status);
      console.log(payment.transaction_amount);

      if (payment.status === "approved") {

        // 🔥 EVITAR DUPLICADOS
        const existingOrder = await Order.findOne({ payment_id: payment.id });

        if (existingOrder) {
          console.log("⚠️ Pedido ya existe, no duplicar");
          return res.sendStatus(200);
        }

        console.log("✅ PAGO APROBADO — GUARDANDO PEDIDO");

        const newOrder = {
          order_id: customer.order_id || "VW-" + Date.now(),
          payment_id: payment.id,

          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          city: customer.city,
          zipCode: customer.zipCode,

          items: order.items,
          amount: payment.transaction_amount,
          status: payment.status,
          date: new Date().toISOString(),
        };

        await Order.create(newOrder);

        console.log("📦 PEDIDO GUARDADO EN MONGODB");
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error webhook:", error);
    res.sendStatus(500);
  }
});

// ===== INICIAR SERVIDOR =====
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import mongoose from "mongoose";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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

app.post("/webhook", async (req, res) => {
  try {
    console.log("🔔 WEBHOOK RECIBIDO");
    console.log(req.body);

    let paymentId;

    // 📌 Caso 1: viene como payment
    if (req.body.type === "payment") {
      paymentId = req.body.data.id;
    }

    // 📌 Caso 2: viene como topic
    if (req.body.topic === "payment") {
      paymentId = req.body.resource;
    }

    if (!paymentId) return res.sendStatus(200);

    // 🔍 Consultar pago real
    const paymentRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        },
      }
    );

    const payment = await paymentRes.json();

    console.log("💰 PAGO:", payment.status);

    if (payment.status !== "approved") {
      return res.sendStatus(200);
    }

    // 🔍 Obtener metadata (TU INFO DEL CLIENTE)
    const metadata = payment.metadata || {};
    const customer = metadata.customer || {};

    console.log("👤 CUSTOMER:", customer);

    // 🛑 EVITAR DUPLICADOS
    const existing = await Order.findOne({ payment_id: payment.id });
    if (existing) {
      console.log("⚠️ Pedido ya existe");
      return res.sendStatus(200);
    }

    // 💾 GUARDAR EN MONGO
    const newOrder = {
      order_id: "VW-" + payment.id,
      payment_id: payment.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      amount: payment.transaction_amount,
      status: payment.status,
      date: new Date().toISOString(),
      items: payment.additional_info?.items || []
    };

    await Order.create(newOrder);
    await sendConfirmationEmail(newOrder);

    console.log("✅ PEDIDO GUARDADO EN MONGODB");

    res.sendStatus(200);

  } catch (error) {
    console.error("❌ Error webhook:", error);
    res.sendStatus(500);
  }
});

// ===== INICIAR SERVIDOR =====
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

async function sendConfirmationEmail(order) {
  try {
    await transporter.sendMail({
      from: `"VibeWear" <${process.env.EMAIL_USER}>`,
      to: order.email,
      subject: "🖤 Confirmación de tu pedido - VibeWear",
      html: `
      <div style="background:#0a0a0a;padding:40px;font-family:Arial,sans-serif;color:#fff;">
  
        <div style="max-width:600px;margin:auto;background:#111;border-radius:12px;overflow:hidden;border:1px solid rgba(224,162,201,0.2);">

          <!-- HEADER -->
            <div style="background:#000;padding:20px;text-align:center;border-bottom:1px solid rgba(224,162,201,0.2);">
              <h1 style="color:#e0a2c9;margin:0;letter-spacing:2px;">VIBEWEAR</h1>
            </div>

          <!-- BODY -->
            <div style="padding:30px;text-align:center;">
              <h2 style="color:#e0a2c9;">🖤 ¡Pago confirmado!</h2>
      
              <p style="color:#ccc;">Hola <strong>${order.name}</strong>,</p>
              <p style="color:#aaa;">Tu pedido ha sido aprobado correctamente.</p>

          <!-- CARD -->
            <div style="background:rgba(224,162,201,0.08);border:1px solid rgba(224,162,201,0.2);border-radius:10px;padding:20px;margin:30px 0;">
        
              <p style="font-size:12px;color:#888;letter-spacing:2px;">NÚMERO DE ORDEN</p>
              <h2 style="color:#e0a2c9;margin:10px 0;">${order.order_id}</h2>

              <p style="margin-top:20px;color:#aaa;">💰 Total: <strong>$${order.amount}</strong></p>
              <p style="color:#aaa;">📦 Dirección: ${order.address}</p>
            </div>

          <!-- BOTÓN -->
            <a href="https://ytzjakdiaz.github.io/VibeWear/" style="display:inline-block;margin-top:20px;padding:14px 30px;background:#e0a2c9;color:#000;text-decoration:none;border-radius:6px;font-weight:bold;letter-spacing:1px;"> VER TIENDA </a>

        </div>

          <!-- FOOTER -->
            <div style="background:#000;padding:20px;text-align:center;border-top:1px solid rgba(224,162,201,0.2);">
              <p style="color:#777;font-size:12px;margin:0;">
              © VibeWear — Streetwear Culture
              </p>
            </div>

        </div>
      </div>
    `,
  });

    console.log("📧 Email enviado");
  } catch (error) {
    console.error("❌ Error enviando email:", error);
  }
}
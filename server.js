import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import mongoose from "mongoose";
import nodemailer from "nodemailer";

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIG EMAIL =====
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ===== MODELO MONGO =====
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

// ===== MIDDLEWARES =====
app.use(cors());
app.use(express.json());

// ===== TEST =====
app.get("/", (req, res) => {
  res.json({ message: "Servidor corriendo correctamente" });
});

// ===== CREAR PREFERENCIA =====
app.post("/create-preference", async (req, res) => {
  try {
    const response = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          items: req.body.items,
          metadata: {
            customer: req.body.customer,
          },
          notification_url:
            "https://vibewear-server-w0z2.onrender.com/webhook",
          back_urls: {
            success:
              "https://ytzjakdiaz.github.io/VibeWear/files/success.html",
            failure:
              "https://ytzjakdiaz.github.io/VibeWear/files/failure.html",
            pending:
              "https://ytzjakdiaz.github.io/VibeWear/files/pending.html",
          },
          auto_return: "approved",
        }),
      }
    );

    const data = await response.json();

    console.log("🟡 Preferencia creada:");
    console.log(data);

    if (!data.init_point) {
      return res.status(400).json({
        error: "MercadoPago error",
        details: data,
      });
    }

    res.json({ init_point: data.init_point });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: "Error creando preferencia" });
  }
});

// ===== CONEXIÓN MONGO =====
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("🟢 MongoDB conectado"))
  .catch((err) => console.log("🔴 Error MongoDB:", err));

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    console.log("🔔 WEBHOOK RECIBIDO");
    console.log(JSON.stringify(req.body, null, 2));

    let paymentId;

    // Caso 1
    if (req.body.type === "payment") {
      paymentId = req.body.data?.id;
    }

    // Caso 2
    if (req.body.topic === "payment") {
      paymentId = req.body.resource;
    }

    if (!paymentId) {
      console.log("⚠️ No hay paymentId");
      return res.sendStatus(200);
    }

    // ===== CONSULTAR PAGO =====
    const paymentRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        },
      }
    );

    const payment = await paymentRes.json();

    console.log("💰 Estado del pago:", payment.status);

    if (payment.status !== "approved") {
      console.log("⏳ Pago no aprobado");
      return res.sendStatus(200);
    }

    // ===== DATOS CLIENTE =====
    const customer = payment.metadata?.customer || {};

    console.log("👤 CUSTOMER:", customer);

    // ===== EVITAR DUPLICADOS =====
    const existing = await Order.findOne({ payment_id: payment.id });

    if (existing) {
      console.log("⚠️ Pedido ya existe");
      return res.sendStatus(200);
    }

    // ===== CREAR ORDEN =====
    const newOrder = {
      order_id: "VW-" + payment.id,
      payment_id: payment.id,
      name: customer.name || "Cliente",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      city: customer.city || "",
      zipCode: customer.zipCode || "",
      items: payment.additional_info?.items || [],
      amount: payment.transaction_amount,
      status: payment.status,
      date: new Date().toISOString(),
    };

    console.log("📦 ORDEN FINAL:", newOrder);

    await Order.create(newOrder);

    // ===== ENVIAR EMAIL =====
    if (newOrder.email && newOrder.email.trim() !== "") {
      console.log("📨 Enviando email a:", newOrder.email);
      await sendConfirmationEmail(newOrder);
    } else {
      console.log("⚠️ Email no válido");
    }

    console.log("✅ Pedido guardado en MongoDB");

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error webhook:", error);
    res.sendStatus(500);
  }
});

// ===== EMAIL =====
async function sendConfirmationEmail(order) {
  try {
    console.log("📨 Intentando enviar email a:", order.email);

    await transporter.sendMail({
      from: `"VibeWear" <${process.env.EMAIL_USER}>`,
      to: order.email,
      subject: "🖤 Confirmación de tu pedido - VibeWear",
      html: `
      <div style="background:#0a0a0a;padding:40px;font-family:Arial,sans-serif;color:#fff;">
        <div style="max-width:600px;margin:auto;background:#111;border-radius:12px;overflow:hidden;border:1px solid rgba(224,162,201,0.2);">

          <div style="background:#000;padding:20px;text-align:center;">
            <h1 style="color:#e0a2c9;margin:0;">VIBEWEAR</h1>
          </div>

          <div style="padding:30px;text-align:center;">
            <h2 style="color:#e0a2c9;">🖤 ¡Pago confirmado!</h2>
            <p>Hola <strong>${order.name}</strong>,</p>
            <p>Tu pedido fue aprobado correctamente.</p>

            <div style="background:rgba(224,162,201,0.08);padding:20px;border-radius:10px;margin:20px 0;">
              <p style="font-size:12px;color:#888;">ORDEN</p>
              <h2 style="color:#e0a2c9;">${order.order_id}</h2>

              <p>💰 Total: <strong>$${order.amount}</strong></p>
              <p>📦 Dirección: ${order.address}</p>
            </div>

            <a href="https://ytzjakdiaz.github.io/VibeWear/" 
              style="display:inline-block;padding:14px 30px;background:#e0a2c9;color:#000;text-decoration:none;border-radius:6px;">
              VER TIENDA
            </a>
          </div>

          <div style="background:#000;padding:20px;text-align:center;">
            <p style="color:#777;font-size:12px;">
              © VibeWear — Streetwear Culture
            </p>
          </div>

        </div>
      </div>
      `,
    });

    console.log("📧 Email enviado correctamente");
  } catch (error) {
    console.error("❌ Error enviando email:", error);
  }
}

// ===== TEST EMAIL =====
app.get("/test-email", async (req, res) => {
  await sendConfirmationEmail({
    name: "Test",
    email: "TUEMAIL@gmail.com",
    order_id: "VW-TEST",
    amount: 10000,
    address: "Test address",
  });

  res.send("Email enviado");
});

// ===== INICIAR SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
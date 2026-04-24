import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import mongoose from "mongoose";
import nodemailer from "nodemailer";

const app = express();
const PORT = process.env.PORT || 3000;

// ===== EMAIL CONFIG =====
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ===== MONGO MODEL =====
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

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

// ===== TEST =====
app.get("/", (req, res) => {
  res.json({ message: "Servidor corriendo correctamente" });
});

// ===== CREATE PREFERENCE =====
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

    console.log("🟡 Preferencia creada:", data.id);

    if (!data.init_point) {
      return res.status(400).json({ error: data });
    }

    res.json({ init_point: data.init_point });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: "Error creando preferencia" });
  }
});

// ===== MONGO CONNECT =====
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

    if (req.body.type === "payment") {
      paymentId = req.body.data?.id;
    }

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

    console.log("💰 Estado:", payment.status);

    if (payment.status !== "approved") {
      return res.sendStatus(200);
    }

    const customer = payment.metadata?.customer || {};

    console.log("👤 CUSTOMER:", customer);

    // 🛑 Evitar duplicados
    const existing = await Order.findOne({ payment_id: payment.id });
    if (existing) {
      console.log("⚠️ Pedido ya existe");
      return res.sendStatus(200);
    }

    // 💾 Crear orden
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

    console.log("📦 ORDEN:", newOrder);

    await Order.create(newOrder);

    // 📧 EMAIL
    if (newOrder.email) {
      await sendConfirmationEmail(newOrder);
    }

    console.log("✅ Guardado + Email enviado");

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error webhook:", error);
    res.sendStatus(500);
  }
});

// ===== EMAIL FUNCTION =====
async function sendConfirmationEmail(order) {
  try {
    console.log("📨 Enviando email a:", order.email);

    const itemsHTML = order.items
      .map(
        (item) => `
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.05);">
          <div style="color:#ccc;">
            <div>${item.title}</div>
            <div style="font-size:12px;color:#777;">x${item.quantity}</div>
          </div>
          <div style="color:#e0a2c9;font-weight:bold;">
            $${new Intl.NumberFormat("es-CO").format(
              item.unit_price * item.quantity
            )}
          </div>
        </div>
      `
      )
      .join("");

    await transporter.sendMail({
      from: `"VibeWear" <${process.env.EMAIL_USER}>`,
      to: order.email,
      subject: "🖤 Confirmación de tu pedido - VibeWear",
      html: `
<div style="background:#0a0a0a;padding:40px;font-family:Arial,sans-serif;color:#fff;">
  <div style="max-width:600px;margin:auto;background:#111;border-radius:12px;overflow:hidden;border:1px solid rgba(224,162,201,0.2);">

    <div style="background:#000;padding:25px;text-align:center;">
      <h1 style="color:#e0a2c9;margin:0;font-size:32px;letter-spacing:3px;">
        VIBEWEAR
      </h1>
    </div>

    <div style="padding:30px;">
      
      <h2 style="color:#e0a2c9;text-align:center;">
        🖤 ¡Pago confirmado!
      </h2>

      <p style="color:#ccc;text-align:center;">
        Hola <strong>${order.name}</strong>,
      </p>

      <p style="color:#aaa;text-align:center;margin-bottom:30px;">
        Tu pedido fue aprobado correctamente.
      </p>

      <div style="margin-bottom:30px;">
        <h3 style="color:#e0a2c9;">🛍️ Tu pedido</h3>
        ${itemsHTML}
      </div>

      <div style="background:rgba(224,162,201,0.08);border:1px solid rgba(224,162,201,0.2);border-radius:10px;padding:20px;">
        <p style="font-size:11px;color:#888;">ORDEN</p>
        <h2 style="color:#e0a2c9;">${order.order_id}</h2>

        <p>💰 Total: <strong>$${new Intl.NumberFormat("es-CO").format(
          order.amount
        )}</strong></p>

        <p>📦 ${order.address}</p>
        <p>🏙️ ${order.city}</p>
        <p>📮 ${order.zipCode}</p>
      </div>

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

    console.log("📧 Email enviado");
  } catch (error) {
    console.error("❌ Error email:", error);
  }
}

// ===== TEST EMAIL =====
app.get("/test-email", async (req, res) => {
  await sendConfirmationEmail({
    name: "Test",
    email: "TUEMAIL@gmail.com",
    order_id: "VW-TEST",
    amount: 10000,
    address: "Test",
    city: "Barranquilla",
    zipCode: "080001",
    items: [
      {
        title: "Camiseta Test",
        quantity: 1,
        unit_price: 10000,
      },
    ],
  });

  res.send("Email enviado");
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({ message: "Servidor corriendo correctamente" });
});
app.get("/test-payment", async (req, res) => {
    try {
        const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
                items: [
                    {
                        title: "Producto de prueba",
                        quantity: 1,
                        currency_id: "COP",
                        unit_price: 10000
                    }
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

const ACCESS_TOKEN = "APP_USR-4721285442073566-041917-23754951322e0ac9a2364ef88e4eeab9-3346852400";

app.post("/create-preference", async (req, res) => {
    try {
        const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
                items: req.body.items,
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

// Si MercadoPago devuelve error, lo enviamos al frontend
        if (!data.init_point) {
        return res.status(400).json({
        error: "MercadoPago error",
        details: data
    });
}

        res.json({ init_point: data.init_point });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error creando preferencia" });
    }
});

app.listen(3000, () => {
    console.log("Servidor corriendo en http://localhost:3000");
});

// ===== WEBHOOK MERCADOPAGO =====
app.post("/webhook", async (req, res) => {
  try {
    console.log("🔔 WEBHOOK RECIBIDO");
    console.log(req.body);

    const paymentId = req.body?.data?.id;

    if (!paymentId) {
      return res.sendStatus(200);
    }

    // Consultar el pago real a MercadoPago
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    });

    const payment = await response.json();

    console.log("💰 PAGO DETALLE:");
    console.log(payment.status);
    console.log(payment.transaction_amount);

    if (payment.status === "approved") {
      console.log("✅ PAGO APROBADO — GUARDAR PEDIDO");
      // aquí luego guardaremos pedidos
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error webhook:", error);
    res.sendStatus(500);
  }
});
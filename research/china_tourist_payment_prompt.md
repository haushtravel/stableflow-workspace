# Prompt para Gemini Deep Research: Análisis del Ecosistema de Pagos para Turistas en China

Este prompt está optimizado para ser copiado directamente en **Gemini Deep Research** (o la herramienta de investigación avanzada de tu preferencia) con el fin de estudiar a profundidad las soluciones implementadas en China para pagos de extranjeros y extraer aprendizajes clave para **Spree (StableFlow)**.

---

```text
Realiza una investigación exhaustiva y un análisis técnico y financiero detallado sobre las soluciones de pago digital y el ecosistema de servicios integrados (Traveler OS / Super-Apps) para turistas extranjeros y no residentes en China, enfocándote en Alipay (Ant Group) y WeChat Pay (Tencent).

El objetivo es extraer las mejores prácticas, estructuras de comisiones, flujos de KYC y lecciones de producto de estos sistemas para aplicarlos al desarrollo de "Spree", una travel wallet basada en stablecoins orientada a turistas y nómadas digitales en América Latina (quienes necesitan pagar a través de códigos QR locales como Pix en Brasil y Transferencias 3.0 en Argentina).

Estructura la investigación en los siguientes bloques específicos:

1. Flujo de Onboarding e Integración de Tarjetas Internacionales:
- ¿Cómo funcionan actualmente WeChat Pay y Alipay al permitir que los extranjeros vinculen tarjetas de crédito y débito internacionales (Visa, Mastercard, Discover, JCB)? Mapea el flujo técnico paso a paso.
- ¿Cómo se realiza el proceso de verificación de identidad (eIDV) y KYC para extranjeros que no cuentan con un número de identidad o teléfono chino? ¿Qué documentos se solicitan y qué APIs/socios tecnológicos utilizan para validar pasaportes en tiempo real?
- ¿Cuáles son los límites de transacciones diarios, anuales y por transacción individual para cuentas de extranjeros antes y después de completar el KYC avanzado?

2. Tarjetas Bancarias Virtuales (Caso Alipay "Tour Card" / "Tour Pass"):
- Analiza el funcionamiento técnico y el modelo financiero de Alipay Tour Card (en alianza con Bank of Shanghai).
- ¿Cómo se fondean estas tarjetas virtuales y cuál es su ciclo de vida? ¿Cómo se procesa la devolución del dinero no gastado al finalizar el viaje del turista?
- ¿Cuáles son los costos y comisiones aplicados al turista en el fondeo (inbound), consumo (pago) y reembolso (outbound)?

3. Economía Unitaria (Unit Economics) y Estructura de Comisiones:
- Detalla cómo se reparten las comisiones de procesamiento en transacciones de tarjetas internacionales vinculadas.
- Analiza la regla de cobro actual: ¿por qué los pagos menores a 200 RMB (aprox. $28 USD) están exentos de comisiones para el usuario final y cómo absorben las plataformas ese coste de adquirencia de Visa/Mastercard?
- Para pagos superiores a 200 RMB, ¿por qué se aplica una tarifa fija del 3% y cómo se divide ese ingreso entre las plataformas chinas, los bancos adquirentes y las marcas de tarjeta de origen?
- ¿Cómo impacta esta estructura de tarifas en los comercios locales chinos en términos de MDR (Merchant Discount Rate) y plazos de liquidación cuando reciben un pago originado en una tarjeta extranjera?

4. Mini-Programas como el "Traveler OS" Definitivo:
- Analiza cómo WeChat y Alipay se convirtieron en un sistema operativo de viaje integrando aplicaciones de terceros ("Mini-Apps") para resolver necesidades cotidianas.
- ¿Cómo acceden los turistas a servicios esenciales como transporte público (Metro QR), movilidad (Didi), trenes de larga distancia (12306), delivery y reservas de hoteles sin salir de la aplicación de pago y usando el mismo saldo?
- ¿Cómo funciona la arquitectura de seguridad y la delegación de tokens de pago (tokenized payments) hacia estos mini-programas de terceros?

5. Conclusiones y Equivalencias Estratégicas para LATAM (Spree):
- Basándote en tus hallazgos, propón cómo Spree puede adaptar estas lecciones al ecosistema de América Latina (Pix, Mercado Pago, Bre-B, QR Simple).
- Diseña una estrategia de precios híbrida equivalente para Spree: ¿cómo podríamos waivear (eximir) comisiones en micropagos locales QR inferiores a $15 USD y compensar aplicando un fee dinámico en transacciones mayores, considerando la integración de Bridge ACH/SEPA y Stripe Cards?
- Propón un flujo de KYC progresivo (SMS -> OCR Pasaporte -> Lectura NFC) adaptado a la velocidad del modelo chino.
```

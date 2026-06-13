# Prompt para Gemini Deep Research: Integración y Comparativa de Bridge.xyz vs. Bitso Business en Spree

Este archivo contiene el prompt optimizado para ser copiado y pegado en **Gemini Deep Research**. El objetivo es evaluar de manera exhaustiva ambas plataformas B2B, entender sus fortalezas y dependencias, y determinar si es técnicamente factible o financieramente conveniente consolidar toda la operación en una sola, o si la sinergia de ambas es indispensable para **Spree**.

---

## Copia y Pega el Siguiente Prompt en Gemini Deep Research:

```text
Realiza un análisis técnico y financiero profundo para evaluar la integración de las plataformas de infraestructura de pagos "Bridge.xyz" (adquirida por Stripe) y "Bitso Business" (la división corporativa de Bitso) en el contexto de nuestra aplicación "Spree" (un travel wallet para extranjeros que viajan a América Latina). 

El objetivo es analizar ambas plataformas de forma individual, mapear sus funcionalidades frente a nuestro flujo de pagos (Inbound y Outbound), evaluar áreas de solapamiento y determinar si una de ellas puede absorber por completo las funciones de la otra, o si la combinación de ambas es estrictamente necesaria.

Enfoca el análisis en los siguientes apartados detallados:

1. Estudio Individual de Bridge.xyz:
- ¿Cuáles son sus características clave (APIs de Virtual Accounts, Orchestration, Payouts)?
- ¿Cómo funciona su sistema de cuentas virtuales para recibir transferencias tradicionales en USD (ACH/Wire) y EUR (SEPA)? ¿Cuál es la estructura de comisiones para estas operaciones?
- ¿Cuáles son sus capacidades de Off-ramp (conversión de stablecoin a fiat local)? ¿Qué monedas locales de América Latina soporta activamente para liquidación saliente y a qué costes?
- ¿Cómo maneja la custodia de claves cripto y la emisión de stablecoins en redes como Polygon?

2. Estudio Individual de Bitso Business:
- ¿Cuáles son sus características clave (APIs de Multi-Currency Account, Liquidez y Conciliación)?
- ¿Cuáles son sus capacidades de integración con rieles locales de pago y transferencias inmediatas en LATAM: Pix (Brasil), Coelsa/CVU/CBU (Argentina), SPEI (México), y PSE/Bre-B (Colombia)?
- ¿Cuál es su modelo regulatorio local en Argentina (registro PSAV ante la CNV) y Brasil, y qué tan rápido ejecutan las liquidaciones locales?
- ¿Cuál es su estructura de tarifas para swaps (USDC a ARS/BRL) y transferencias locales salientes?

3. Análisis de Solapamiento y Redundancia (¿Puede una absorber a la otra?):
- ¿Puede Bridge.xyz absorber las funciones de Bitso Business? Específicamente: ¿Tiene Bridge la capacidad de liquidar directamente y en tiempo real a CVUs/CBUs de Mercado Pago o MODO en Argentina, y claves Pix en Brasil, aplicando tipos de cambio competitivos (como el Dólar MEP o el paralelo en Bolivia) sin usar un intermediario local?
- ¿Puede Bitso Business absorber las funciones de Bridge.xyz? Específicamente: ¿Puede Bitso emitir de forma programática números de ruta/cuenta de EE. UU. (ACH) e IBANs europeos (SEPA) individuales para usuarios finales extranjeros (turistas no residentes) con el fin de automatizar la acreditación de stablecoins a bajo coste?
- Identifica las dependencias regulatorias o técnicas que impiden que cualquiera de las dos funcione de manera independiente en un flujo de turismo global a LATAM.

4. Diseño de Arquitectura Propuesta para Spree:
- Si se requiere una sinergia, define el flujo técnico paso a paso: cómo entra el fiat del turista estadounidense/europeo vía Bridge, cómo se almacena en la app en formato USDc (Polygon) y cómo se liquida atómicamente a través de Bitso Business para pagar un QR de Mercado Pago en Argentina o Pix en Brasil.
- Evalúa los puntos de fricción del flujo integrado: tiempos de conciliación de API, webhooks requeridos, manejo de fallas en los swaps de divisas y gestión del KYC (quién verifica al turista y quién reporta a la UIF/CNV local).
```

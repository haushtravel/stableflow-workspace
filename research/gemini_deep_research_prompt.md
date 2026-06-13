# Prompt para Gemini Deep Research: Soluciones de Pago para Turistas en LATAM

Este archivo contiene el prompt optimizado para ser copiado y pegado en **Gemini Deep Research**. Está diseñado para realizar una investigación exhaustiva y recopilar información detallada sobre competidores, modelos de negocio y arquitecturas técnicas en el sector de las billeteras de viaje transfronterizas.

---

## Copia y Pega el Siguiente Prompt en Gemini Deep Research:

```text
Realiza una investigación profunda y exhaustiva a nivel mundial para identificar y analizar plataformas fintech, startups y billeteras digitales (B2C o B2B2C) similares a "WanderWallet" (wanderwallet.io) que estén diseñadas específicamente para turistas, nómadas digitales y expatriados, y que les permitan realizar pagos en redes de pago locales cerradas en América Latina sin requerir identificaciones locales (como el CPF en Brasil, DNI en Argentina o RUT en Chile).

La investigación debe centrarse en encontrar soluciones que permitan pagar usando rieles locales como:
- Pix (Brasil)
- Mercado Pago, MODO o Transferencias 3.0 (Argentina)
- Bre-B (Colombia)
- QR Simple (Bolivia)
- Copec Pay, Fpay u otros códigos QR locales en Chile y Perú.

Para cada competidor o solución similar identificada, investiga y detalla lo siguiente:

1. Perfil del Competidor:
- Nombre, sitio web y países en los que opera activamente.
- Tipo de licencia bajo la que opera (¿es una fintech registrada, PSAV, billetera de criptomonedas o utiliza infraestructura delegada de terceros?).

2. Arquitectura "Bajo el Capó" y Proveedores:
- ¿Cuáles son sus socios tecnológicos para el on-ramp (recarga de saldo)? (ej. Noah US, Stripe, Plaid).
- ¿Quién gestiona la custodia de los fondos? (¿Son cripto-nativos usando stablecoins como USDC/USDT con custodia MPC como Circle, o utilizan fideicomisos bancarios tradicionales?).
- ¿Cuáles son sus socios locales de eFX y off-ramp para liquidar al comercio local? (ej. Manteca, Depay, Avenia, PagBrasil, KamiPay, Istmo).
- ¿Cómo gestionan el proceso de KYC de extranjeros sin identificaciones locales? (¿Usan proveedores como Didit.me, Persona, Sumsub?).

3. Medios de Fondeo y Estructura de Costes (Unit Economics):
- ¿Qué medios de carga soportan (tarjetas de crédito internacionales, Apple/Google Pay, transferencias ACH/SEPA, Revolut, stablecoins directas)?
- Detalla sus comisiones: comisiones de carga, spreads cambiarios aplicados en la conversión de divisa, comisiones por realizar pagos y comisiones por retiro/reembolso (refund).
- ¿Cómo mitigan las altas tarifas de adquirencia internacional de las tarjetas tradicionales (Stripe, adquirentes tradicionales)? ¿Están impulsando transferencias de bajo coste (ACH/SEPA) o cripto?

4. Servicios de Viaje de Valor Agregado (Marketplace):
- ¿Ofrecen servicios adicionales integrados en la app, como eSIM de datos móviles, seguros de viaje (ej. Chubb, Allianz) o reservas de tours (ej. Civitatis, Viator, GetYourGuide)? ¿Cómo monetizan estas integraciones?

5. Conclusiones y Comparativa:
- Presenta una matriz comparativa detallada en formato tabla que resuma los competidores encontrados frente a WanderWallet en términos de: Moneda de cuenta, Rieles de fondeo, Rieles de pago destino, Comisiones, y Servicios integrados.
- Identifica tendencias de consolidación en infraestructura de stablecoins (ej. Bridge/Stripe) en América Latina para facilitar pagos transfronterizos de consumo.
```

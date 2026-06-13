# Comparativa Técnica "Bajo el Capó": Spree (StableFlow) vs. WanderWallet

Este documento detalla un análisis comparativo de la arquitectura interna de **Spree (StableFlow)** y **WanderWallet**, enfocándose en cómo resolver la ineficiencia de costes de los medios de fondeo (las altas comisiones de Stripe para tarjetas internacionales) y cómo se estructuran las integraciones detrás de escena en ambas plataformas.

---

## 1. El Dilema del Fondeo: ¿Por qué Stripe es caro?

En nuestro análisis previo de Unit Economics de Spree, determinamos que el procesamiento de tarjetas internacionales con **Stripe** es insostenible como riel principal de entrada de dinero (*Inbound*):
* **Costo Stripe:** Entre **2.9% + $0.30 USD** (tarjetas de EE. UU.) y **3.9%** (tarjetas europeas/otras), sumando un costo inbound promedio de **3.5%** al pasar por la orquestación fíat-a-cripto.
* **El Arrastre de Tarifa:** Si cobramos un 1.0% de comisión de carga (*preload fee*) al usuario, Spree debe absorber el **2.5%** restante de su propio margen de consumo. Esto eleva nuestro punto de equilibrio (*break-even*) a **$90 USD gastados por turista** antes de generar ganancias netas.

---

## 2. La Solución de WanderWallet vs. Nuestra Decisión Estratégica

Ambas plataformas identificaron el problema de las tarjetas de crédito tradicionales, pero tomaron caminos técnicos diferentes para resolverlo:

```
                   ┌────────────────────────────────────────────────────────┐
                   │                     EL DILEMA DE FONDEO                │
                   └───────────────────────────┬────────────────────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼                                               ▼
         [ SOLUCIÓN WANDERWALLET ]                            [ DECISIÓN SPREE ]
     · Elimina cobros con Tarjeta.                        · Mantiene Tarjeta para emergencias
     · Terceriza On-ramp a Noah US.                         (Stripe 3DS2 cobrando 1% + spreads).
     · Fondeo vía ACH ($2+0.2%) y SEPA                     · Integra API Bridge Virtual Accounts
       gratuito vía webview bancaria.                        para transferencias ACH/SEPA (0.3% fee).
     · Recarga nativa en USDC (Polygon).                   · Integra Bitso Business para cobro en ARS/BRL.
```

### A. El enfoque de WanderWallet: Tercerización de Cuentas Virtuales (Noah US)
WanderWallet **no ofrece pagos con tarjeta de crédito/débito** en su aplicación. Resolvieron la barrera de coste delegando el flujo completo de fiat a un tercero:
*   **Noah US, Inc. (API/Webview):** Cuando el usuario quiere cargar dinero, se abre un webview de Noah. Este socio genera cuentas bancarias virtuales para el usuario.
*   **Rieles de bajo coste:** El fondeo se hace exclusivamente a través de transferencias **ACH en USD** ($2 + 0.2% de fee fijo) o **SEPA en EUR** (completamente gratuito e instantáneo).
*   **Acreditación Cripto:** Noah convierte el dinero fiat en USDC y lo transfiere a la billetera cripto del usuario en la red Polygon. WanderWallet nunca toca el fíat en esta fase ni asume el coste adquirente.

### B. El enfoque de Spree: Modelo Híbrido con Bridge y Bitso (Modelo Rémora)
Nuestra decisión estratégica es mantener una experiencia de usuario más fluida ofreciendo un modelo híbrido basado en la arquitectura **API-First (Rémora)**:
1.  **Tarjetas (Stripe 3DS2) para inmediatez:** Mantenemos la opción de tarjetas internacionales y Apple/Google Pay para cargas rápidas de emergencia, pero compensando la tarifa (3.5% de coste) mediante un preload fee de 1% y el spread cambiario del 2.5% en los consumos locales.
2.  **API de Bridge Virtual Accounts (Bajo coste):** Integrar la API de Bridge para emitir números de ruta y cuenta ACH/SEPA directamente dentro de Spree. Bridge cobra solo un **0.3%** por la conversión fiat-a-stablecoin. Esto reduce nuestro costo inbound en un **90%** en comparación con Stripe Cards, permitiendo recargas masivas de bajo coste para nómadas digitales que se quedan meses en LATAM.
3.  **Bitso Business (Fondeo regional LATAM):** Aprovechar la infraestructura de Bitso para recibir transferencias en pesos argentinos (ARS) o reales (BRL) mediante rieles locales (Pix/Coelsa) y realizar un swap atómico automático a USDC en la cuenta de Spree del usuario.

---

## 3. Comparativa de Arquitectura Interna (Bajo el Capó)

| Capa Tecnológica | **Spree (StableFlow)** (Arquitectura Rémora B2B2C) | **WanderWallet** (Integración Multitercero) |
| :--- | :--- | :--- |
| **Núcleo de Custodia** | **B2B2C / APIs de PSAVs:** El balance de USDc se gestiona en cuentas virtuales mediante APIs de exchanges regulados localmente (como **Bitso Business**). | **Circle MPC Custody:** Utilizan billeteras programables con tecnología *Multi-Party Computation* (MPC) provistas directamente por **Circle**. |
| **Flujo de On-ramp (Fiat Inbound)** | **Stripe API + Bridge API:** Fondeo mixto mediante tokenización de tarjetas con autenticación activa **3DS2** y cuentas virtuales ACH/SEPA programáticas. | **Noah US Webview:** El on-ramp fiat se delega en un iframe/webview cerrado gestionado por Noah US. WanderWallet no procesa el fiat de fondeo. |
| **Flujo de Off-ramp (Local Payments)** | **Bitso API / Ripio:** Conversión atómica instantánea de USDC a ARS/BRL y transferencia inmediata a través de la red local del exchange (Coelsa/Pix). | **Gateways Regionales Fraccionados:**<br>- Argentina: **Depay.us** (QR y Alias)<br>- Brasil: **Avenia** (Pix)<br>- Bolivia/Colombia: **Manteca** (Fiat-Cripto API) |
| **Sistema de KYC** | **KYC Delegado y Progresivo:** Tier 1 (Verificación SMS/OTP rápida) y Tier 2 (Pasaporte integrado con pasarela de identidad de Stripe o Bitso). | **Didit.me (KYC Descentralizado):** WanderWallet delega la carga y verificación de documentos a Didit y las cuentas bancarias a Noah. Ellos no almacenan KYC. |
| **Infraestructura Cloud** | Servidor Go compilado + Postgres DB alojado en la nube (Render / AWS). | Servidores **Azure** + Base de datos Postgres en **Supabase** alojados en São Paulo, Brasil. |

---

## 4. Análisis de Unit Economics Comparado (Fondeo de $200 USD)

A continuación se compara el impacto financiero de una recarga de **$200 USD** utilizando tarjetas en Spree frente a las transferencias bancarias de bajo coste que definimos en nuestras últimas decisiones de diseño:

| Métrica Financiera | **Spree (Stripe Cards)** | **Spree (Bridge ACH/SEPA - Nueva Decisión)** | **WanderWallet (Noah ACH)** |
| :--- | :--- | :--- | :--- |
| **Monto Enviado por Usuario** | $200.00 USD | $200.00 USD | $200.00 USD |
| **Costo de Adquirencia/Riel** | ~$7.00 USD (3.5% promedio) | ~$0.60 USD (0.3% Bridge fee) | $2.40 USD ($2.00 flat + 0.2%) |
| **Comisión de Carga al Usuario** | $2.00 USD (1.0% Spree Preload Fee) | $0.00 USD (0.0% Promoción) | $2.40 USD (Traspasado al usuario) |
| **Acreditado Neto en Wallet (USDc)** | **$198.00 USDc** | **$200.00 USDc** | **$197.60 USDc** |
| **Costo Neto Absorbido por la App**| **$5.00 USD** (Pérdida inicial) | **$0.60 USD** (Casi nulo) | **$0.00 USD** (Costo cero para la app) |
| **Punto de Equilibrio (Consumo)** | **$90.00 USD** de gasto | **$11.00 USD** de gasto | **$0.00 USD** (Ganancia desde el primer pago) |

> [!IMPORTANT]
> **Conclusión del Unit Economics:** Al implementar la **API de Bridge Virtual Accounts**, reducimos el coste de fondeo para Spree de **$5.00 USD a solo $0.60 USD** por cada recarga de $200. Esto desploma nuestro punto de equilibrio de consumo de **$90 USD a $11 USD**, incrementando radicalmente la rentabilidad de la plataforma.

---

## 5. Próximos Pasos para Robustecer Nuestra Arquitectura

1.  **Implementar Flujo ACH/SEPA en app.js:**
    Diseñar una pantalla secundaria de recarga en el simulador donde el usuario pueda elegir entre "Tarjeta (Instantáneo)" y "Transferencia Bancaria (Sin Costo)". Al elegir transferencia, el simulador debe mostrar los datos de la Cuenta Bancaria Virtual (CBU/IBAN/Routing) emulando la respuesta de la API de Bridge.
2.  **Adaptador Modular de Off-ramp:**
    Asegurar que `stableflow-backend-go` tenga una interfaz de liquidación modular (`OffRampAdapter`). Esto nos permitirá usar **Bitso** para Argentina/Brasil (SPEI/Pix) pero integrar de forma sencilla proveedores como **Manteca** para Colombia/Bolivia si decidimos expandir nuestra huella geográfica.

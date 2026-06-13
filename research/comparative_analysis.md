# Análisis Comparativo y de Competencia: Spree (StableFlow) vs. WanderWallet

Este documento contiene un estudio detallado de la plataforma **WanderWallet** y otras alternativas del mercado de pagos digitales para turistas en América Latina, contrastando sus características con nuestra propuesta (**Spree / StableFlow**). 

---

## 1. Introducción y Contexto

El mercado de pagos digitales en América Latina está dominado por redes domésticas de transferencias instantáneas y códigos QR (como **Pix** en Brasil y **Mercado Pago / Transferencias 3.0 / MODO** en Argentina). Sin embargo, estas redes suelen estar cerradas para los extranjeros porque exigen un número de identificación fiscal local (CPF en Brasil, DNI en Argentina) y una cuenta bancaria local.

Tanto **WanderWallet** como **Spree (StableFlow)** nacen para resolver esta fricción: permitir que los turistas, nómadas digitales y expatriados paguen como locales escaneando códigos QR domésticos sin necesidad de residencia ni burocracia local, utilizando fondos precargados en monedas duras o estables.

---

## 2. Estudio de WanderWallet (https://wanderwallet.io/)

WanderWallet es una billetera digital especializada en facilitar los pagos de extranjeros en América Latina.

### Características Clave:
*   **Pagos Locales por QR:** Permite escanear y pagar en las redes locales de:
    *   **Brasil:** Pix (QR y transferencias).
    *   **Argentina:** Mercado Pago, MODO, Transferencias 3.0 y transferencias bancarias directas (CBU/CVU/Alias).
    *   **Colombia:** Bre-B (transferencias instantáneas).
    *   **Bolivia:** QR Simple.
*   **Gestión de Divisas:** Los usuarios depositan en USD o EUR y mantienen su balance en esa moneda hasta el momento de realizar el pago local, donde se convierte en tiempo real al tipo de cambio del mercado.
*   **Arbitraje de Tasas (Bolivia):** En Bolivia, aprovechan el tipo de cambio paralelo, ofreciendo una tasa significativamente mejor que la oficial de tarjetas de crédito o cajeros automáticos.
*   **Identificación Simple:** Verificación mediante pasaporte extranjero en lugar de identificaciones locales (no requiere CPF ni DNI).

### Métodos de Fondeo (Top-Up):
1.  **Transferencias Bancarias ACH (USD):** Orientado a usuarios de EE. UU. (Chase, Wells Fargo, etc.). Comisión de **$2 + 0.2%** por depósito. Tarda de 1 a 3 días hábiles.
2.  **Transferencias Bancarias SEPA (EUR):** Orientado a usuarios de Europa. **Gratuito**. Tarda entre instantáneo y 2 días hábiles.
3.  **Depósitos Directos de Revolut:** Transferencia rápida para usuarios de Revolut.
4.  **Establecoin USDC (Red Polygon):** Permite recargar usando criptomonedas sin pasar por el sistema bancario tradicional.

### Limitaciones de WanderWallet:
*   **Falta de Inmediatez en Fondeo Tradicional:** Las transferencias ACH tardan días en acreditarse, lo que impide una recarga instantánea de emergencia usando tarjetas de crédito/débito extranjeras comunes.
*   **Servicios Únicamente de Pago:** Es una herramienta de pago pura. No ofrece ningún valor agregado durante el viaje (conectividad, seguros, reservas, etc.).
*   **Custodia No-Asegurada:** Indican explícitamente que no son un banco y los saldos no están asegurados por la FDIC.

---

## 3. Otras Opciones Similares en el Mercado

Para tener un panorama completo del ecosistema fintech de viajes en la región, identificamos los siguientes competidores y alternativas:

### A. Belo (belo.app)
*   **Descripción:** Billetera digital argentina con enfoque cripto.
*   **Enfoque Turístico:** Permite a los usuarios argentinos pagar con Pix en Brasil debitando de sus balances de stablecoins (USDT/USDC) o pesos argentinos. También permite a los extranjeros registrarse con pasaporte, fondear con cripto y gastar mediante QR en Argentina.
*   **Ventaja:** Interfaz muy pulida y procesamiento instantáneo basado en cripto.
*   **Desventaja:** No está optimizada como una "app de viaje" integral con marketplace de servicios turísticos.

### B. Prex (Prex Argentina / Prex Tourist)
*   **Descripción:** Cuenta digital regional (operando en Uruguay, Argentina y Perú) que ofrece una tarjeta prepaga Mastercard.
*   **Enfoque Turístico:** En Argentina, permite a los turistas extranjeros registrarse temporalmente con su pasaporte (Prex Tourist), cambiar sus dólares a pesos argentinos al tipo de cambio MEP (muy favorable) y gastar usando la tarjeta.
*   **Ventaja:** Amplia aceptación física gracias a la red Mastercard.
*   **Desventaja:** Depende de una tarjeta física/virtual tradicional, lo que no cubre a comercios pequeños de barrio que solo aceptan códigos QR directos de Mercado Pago o Pix y no tienen terminal de tarjetas (posnet).

### C. Wallbit (wallbit.io)
*   **Descripción:** Cuenta financiera global orientada a trabajadores remotos.
*   **Enfoque Turístico:** Permite a usuarios de varios países fondear cuentas en USD y realizar transferencias y pagos instantáneos (incluyendo Pix en Brasil) mediante conversión en el punto de venta.
*   **Ventaja:** Excelente para digital nomads que cobran del exterior.
*   **Desventaja:** La experiencia de usuario está diseñada para finanzas personales globales y no para un viaje de placer de corta duración.

### D. PagBrasil y Beeteller (Soluciones B2B/eFX)
*   **Descripción:** Proveedores de infraestructura de pagos transfronterizos (eFX).
*   **Enfoque Turístico:** PagBrasil ofrece "Pix para turistas internacionales", permitiendo que bancos extranjeros o billeteras globales integren Pix en sus propias apps.
*   **Ventaja:** Respaldo regulatorio fuerte en Brasil.
*   **Desventaja:** No tienen una app directa al consumidor final (B2C) que un turista pueda descargar directamente de las tiendas, actúan como intermediarios.

---

## 4. Matriz Comparativa de Soluciones

| Característica | **Spree (StableFlow)** (Nuestra Propuesta) | **WanderWallet** | **Belo App** | **Prex Tourist** |
| :--- | :--- | :--- | :--- | :--- |
| **Moneda de Cuenta** | **USDc** (Establecoin en Polygon) | **USD / EUR / USDC** | Cripto (USDT/USDC/BTC) / ARS | USD / ARS / UYU / PEN |
| **Fondeo Instantáneo** | **Sí** (Tarjeta de Crédito/Débito, Apple/Google Pay mediante Stripe 3DS2) | Solo vía SEPA instantáneo/USDC. ACH tarda 1-3 días. | Sí (Cripto en red externa o transferencias locales) | Sí (Transferencias locales o depósitos en efectivo) |
| **Seguridad de Tarjetas** | Tokenización Stripe + Validación Bancaria 3DS2 activa | Enlaces bancarios tradicionales (Plaid / SEPA) | Transferencias y P2P cripto | Mastercard tokenizada |
| **Medios de Pago Destino** | Argentina (Mercado Pago, MODO, CBU/CVU) y Brasil (Pix) | Brasil (Pix), Argentina (MP/Alias), Colombia (Bre-B), Bolivia (QR Simple) | Brasil (Pix) y Argentina (QR local) | Tarjeta prepaga Mastercard (red global) |
| **Servicios Adicionales (Marketplace)** | **Sí (Integrado)**: eSIM de datos, Seguro Médico (Chubb), Tours locales (Civitatis) | **No** (Solo pagos) | **No** (Solo pagos y compraventa cripto) | **No** (Solo promociones físicas con comercios adheridos) |
| **Multilenguaje** | **Sí** (Español, Inglés, Italiano, Francés, Alemán) | Principalmente Inglés | Español / Inglés | Español / Inglés |
| **Modelo de Negocio** | Comisión de recarga + Comisión de servicio (3%) + Margen en el Marketplace | Comisión fija de retiro (1.5%) + Comisión ACH ($2 + 0.2%) + Margen de tipo de cambio | Comisión de swap cripto/fiat | Margen en cambio de divisa (MEP/Oficial) |

---

## 5. Diferenciadores Clave de Spree (StableFlow)

Nuestra propuesta cuenta con tres ventajas competitivas fundamentales que nos distancian de WanderWallet y otras soluciones puras de pago:

1.  **Fondeo Instantáneo y Seguro mediante Stripe con 3DS2:**
    *   *Diferencia:* WanderWallet depende principalmente de transferencias bancarias lentas para usuarios de EE. UU. (ACH). Spree permite recargar el balance de forma **instantánea** con cualquier tarjeta de crédito o débito internacional, o mediante billeteras móviles (Apple Pay, Google Pay).
    *   *Seguridad:* Incorporamos el estándar **3DS2 (3D Secure)** simulado/real con Stripe para validar la identidad del titular de la tarjeta y evitar fraudes o contracargos, permitiendo tokenizar tarjetas de forma segura en la app.
2.  **El Marketplace Turístico Integrado ("Mejora tu Viaje"):**
    *   *Diferencia:* Spree no es solo una herramienta de pago para el comercio de la esquina; es un **ecosistema de viaje**. Los usuarios pueden usar su balance de USDc para adquirir servicios críticos para su estadía directamente desde la app:
        *   **Conectividad:** Contratación instantánea de eSIM de datos regionales.
        *   **Seguridad:** Cotización y compra de Seguro Médico de viaje respaldado por *Chubb*.
        *   **Experiencia:** Reserva de excursiones y traslados mediante *Civitatis*.
    *   Esto añade un canal de ingresos por comisiones de afiliados (affiliate fees) que WanderWallet no posee.
3.  **Backbone Cripto-Nativo Invisible (USDc en Polygon):**
    *   *Diferencia:* Usamos la tecnología blockchain para mover fondos de forma instantánea y económica a nivel global. El usuario ve "USDc" (un dólar digital estable), pero por detrás, las transferencias se procesan a fracciones de centavo de dólar en la red Polygon. Esto reduce nuestros costos de operación comparado con intermediarios bancarios tradicionales de eFX.

---

## 6. Oportunidades de Mejora e Ideas a Adoptar de WanderWallet

Estudiando WanderWallet, podemos identificar áreas de mejora para evolucionar el prototipo actual de Spree:

### A. Diversificación de Canales de Fondeo (SEPA / Revolut)
*   **Idea:** Para captar al público europeo que prefiere no usar su tarjeta de crédito (o evitar comisiones por uso de tarjeta), deberíamos añadir soporte en el backend para **transferencias SEPA instantáneas** y depósitos directos desde **Revolut** o **Wise**, manteniendo la recarga libre de comisiones de tarjeta.
*   **Implementación:** En nuestro backend en Go, se pueden crear endpoints que reciban webhooks de proveedores de Open Banking o plataformas de custodia en EUR.

### B. Expansión Geográfica a Colombia y Bolivia
*   **Idea:** WanderWallet ha ganado tracción en Colombia y Bolivia por soportar **Bre-B** y **QR Simple**.
*   **Implementación:** Configurar nuestro resolvedor de QR en el backend (`main.go`) y las pantallas del frontend para procesar los formatos de códigos QR correspondientes a estos países.

### C. Transparencia en Tasas y Tipo de Cambio Paralelo
*   **Idea:** WanderWallet atrae a usuarios en países con brechas cambiarias ofreciendo tipos de cambio paralelos transparentes y mostrándoles cuánto ahorran en comparación con las tarjetas tradicionales.
*   **Implementación:** Mostrar en la pantalla de Dashboard y Checkout de Spree un indicador dinámico de "Ahorro vs. Banco Tradicional" (por ejemplo: *"Pagando con Spree ahorraste un 12% comparado con el cambio oficial de tu tarjeta"*).

---

## 7. Conclusiones y Próximos Pasos

WanderWallet es un excelente benchmark de inmediatez y accesibilidad de pagos locales, pero carece de visión integral de viaje y su fondeo tradicional es lento. 

**Spree (StableFlow)** tiene una propuesta de valor superior al unificar **pagos locales rápidos (tarjetas + 3DS2)** con un **Marketplace de Viajero**.

Para capitalizar esta investigación dentro de nuestro desarrollo:
1.  **Reforzar la simulación del ahorro en la UI:** Incluir en el simulador de checkout una comparativa del tipo de cambio aplicado vs. tipo de cambio bancario estándar.
2.  **Explorar canales de fondeo complementarios:** Diseñar en el flujo de recarga una sección para "Transferencia Bancaria (SEPA/ACH)" para emular las ventajas de coste de WanderWallet.
3.  **Mantener la modularidad del backend:** Asegurar que los adaptadores de pago en `stableflow-backend-go` permitan agregar nuevos rieles locales (como Pix y Mercado Pago hoy, y Bre-B o QR Simple mañana) sin reescribir la lógica del core.

---

## 8. Revelaciones de la Política de Privacidad de WanderWallet (Arquitectura y Proveedores)

Al analizar la política de privacidad oficial de WanderWallet, logramos reconstruir con precisión su arquitectura tecnológica "bajo el capó". A continuación, se detallan sus componentes clave y los proveedores de infraestructura que utilizan:

### A. Custodia de Claves Cripto (MPC)
*   **Proveedor:** **Circle Internet Financial**.
*   **Detalle:** WanderWallet utiliza custodia MPC (Multi-Party Computation) de Circle. Esto confirma que el balance de la app es cripto-nativo (USDC sobre la red Polygon) y que delegan la seguridad de las claves criptográficas a la infraestructura institucional de Circle.

### B. Proveedores de Rieles y Liquidación Local (Off-Ramp)
Para transformar los fondos de los usuarios en pagos locales a los comercios, WanderWallet utiliza adaptadores integrados con socios regionales específicos de pago y eFX:
*   **Argentina:** **Depay.us** (procesamiento y liquidación de pagos para Mercado Pago/MODO/Alias).
*   **Brasil:** **Avenia** (procesamiento y liquidación para Pix).
*   **Bolivia y Colombia:** **Manteca** (proveedor de infraestructura API fiat-a-cripto líder en la región).
*   **Otros Flujos:** **Istmo Settlement Global Inc.** (liquidación transfronteriza y procesamiento de pagos).

### C. Fondeo Bancario y Cuentas Virtuales (On-Ramp)
*   **Proveedor:** **Noah US, Inc.**
*   **Detalle:** Cuando los usuarios optan por la recarga mediante transferencia bancaria (ACH en USD o SEPA en EUR), la interfaz expone un webview seguro controlado por Noah. WanderWallet no almacena ni procesa la documentación de identidad (KYC) asociada a estas cuentas virtuales, delegando por completo la responsabilidad a Noah.

### D. Verificación de Identidad (KYC) General
*   **Proveedor:** **Didit.me**.
*   **Detalle:** El proceso inicial de KYC (selfie, foto de pasaporte, comprobante de domicilio) es gestionado e implementado por la infraestructura descentralizada de Didit.me, evitando que WanderWallet almacene datos sensibles de identidad en sus propios servidores.

### E. Alojamiento e Infraestructura Cloud
*   **Ubicación:** **São Paulo, Brasil (SA-EAST)**.
*   **Detalles:** WanderWallet aloja sus servidores primarios en **Microsoft Azure** y su base de datos Postgres y autenticación en **Supabase**, ambos ubicados físicamente en Brasil. Esto responde a optimizaciones de latencia para las peticiones de Pix y al cumplimiento de la LGPD (Ley General de Protección de Datos) brasileña.

### F. Control de Fraude mediante Geolocalización
*   **Detalle:** WanderWallet registra un **geohash aproximado (precisión de ~153 metros)** del usuario únicamente al confirmar un pago a un comercio (no para transferencias P2P). Esta métrica permite validar la proximidad del usuario con el comercio físico para prevenir fraudes transfronterizos sin rastrear coordenadas exactas de GPS.


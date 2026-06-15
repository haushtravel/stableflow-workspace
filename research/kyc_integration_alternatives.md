# Comparativa Estratégica: Alternativas de Integración de KYC / eIDV para Spree

Para cumplir con el mandato de **maximizar la experiencia del usuario** y **minimizar la complejidad técnica**, evaluamos cuatro métodos de integración de verificación de identidad, yendo más allá de las tradicionales integraciones de API personalizadas.

---

## 1. Métodos de Integración de Identidad

| Método de Integración | Complejidad de Implementación | Experiencia del Usuario (UX) | Costo de Desarrollo | Mantenimiento / Actualizaciones | Idóneo para Spree |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. API Directa (Custom UI)** | **Extrema**. Requiere desarrollar el motor de cámara, captura, recorte y liveness en la app. | Alta, 100% personalizada. | Muy alto. | Complejo (cambios en el backend y SDKs). | **No recomendado** (fricción técnica excesiva). |
| **2. SDK Embebido (Mobile/Web)** | **Media**. Se integran componentes pre-construidos (Sumsub SDK, ZOLOZ SDK). | Excelente. Interfaz optimizada y guías nativas de captura. | Medio. | Medio (actualizaciones periódicas de librerías). | **Recomendado** (mejor balance de UX nativa). |
| **3. Enlace Web Hospedado (Hosted Web Redirect)** | **Muy Baja**. Redirección a una URL segura del proveedor (ej. Stripe Identity, Sumsub Link) mediante WebView. | Buena (salida temporal de la app). | Muy bajo (solo requiere webhook de retorno). | Nulo (el proveedor actualiza la interfaz automáticamente). | **Muy Recomendado** (MVP rápido y limpio). |
| **4. Credenciales Verificables (DID / Web3 ID)** | **Baja**. Conexión con un proveedor de identidad soberana (ej. World ID, Civic, Didit). | Instantánea (un click si el usuario ya está verificado). | Bajo. | Bajo. | **Opcional / Futuro** (excelente para nómadas Web3). |

---

## 2. Análisis Detallado de Alternativas

### Alternativa A: Enlace Web Hospedado (Hosted Link / WebView)
*   **Cómo funciona**: Spree solicita una URL temporal de verificación al backend del proveedor (ej. Stripe Identity) cuando el usuario desea subir de nivel. La app abre un navegador interno (*In-App Browser* como Safari View Controller o Chrome Custom Tabs). El usuario realiza todo el proceso en la infraestructura segura del proveedor. Al finalizar, el proveedor redirige a Spree y envía un Webhook (`identity.verification.succeeded`) a nuestro servidor.
*   **Ventajas**:
    *   **Simplicidad extrema**: Cero desarrollo de lógica de cámara, permisos, detección de reflejos o compatibilidad de dispositivos.
    *   **Seguridad**: Spree nunca "toca" la cámara ni procesa directamente el documento en el frontend, reduciendo drásticamente las cargas de cumplimiento de privacidad y seguridad de datos.
    *   **Sinergia con Stripe**: Dado que Spree utilizará **Bridge.xyz (Stripe)** para el fondeo Inbound, integrar **Stripe Identity** bajo este esquema de enlace hospedado permite consolidar toda la facturación y cumplimiento bajo un mismo ecosistema corporativo.
*   **Desventajas**: El usuario nota una transición visual (pantalla del navegador web dentro de la app), aunque los componentes modernos de Webview permiten personalizar colores y logos para que parezca nativo.

### Alternativa B: SDK Embebido
*   **Cómo funciona**: El proveedor entrega un SDK (ej. React Native / Flutter) que se compila dentro de la aplicación. La interfaz de captura de fotos y liveness ocurre dentro del código nativo de la app de Spree.
*   **Ventajas**: Experiencia premium, fluida y 100% nativa. El usuario nunca siente que "sale" de la aplicación.
*   **Desventajas**: Incrementa el peso del instalador (bundle size) de la aplicación y requiere actualizaciones constantes de dependencias para evitar fallas con nuevas versiones de sistemas operativos (iOS/Android).

### Alternativa C: Credenciales Verificables (Decentralized Identity - DID)
*   **Cómo funciona**: El usuario inicia sesión en Spree y vincula su pasaporte digital previamente verificado en una plataforma de identidad descentralizada (como Civic o World ID). Spree solo verifica una firma criptográfica en la blockchain que certifica: *"Este usuario tiene un pasaporte válido y pasó las listas OFAC/PEP"*.
*   **Ventajas**: **Fricción cero**. La verificación ocurre en un segundo sin que Spree deba volver a escanear el documento física o digitalmente.
*   **Desventajas**: Requiere que el usuario ya tenga esa identidad configurada de antemano. Su adopción generalizada es aún baja fuera de comunidades tecnológicas.

---

## 3. Recomendación Táctica para Spree

Para el lanzamiento (Fase de Validación y MVP), la estrategia más inteligente es **la combinación de Enlaces Hospedados (Hosted Links) y Onboarding Progresivo**:

1.  **Tier 1 (Express)**: Registro por SMS (Fricción cero).
2.  **Tier 2 (Full)**: Redirección mediante **WebView** a **Stripe Identity** o **Sumsub Web Flow**. Esto nos permite salir al mercado en semanas y con costo de desarrollo cercano a cero en la parte de identidad.
3.  **Fase 2 de Escalamiento**: Migrar a un **SDK Embebido** para ofrecer una experiencia nativa fluida solo cuando el volumen de usuarios valide que la fricción del WebView afecta la conversión.

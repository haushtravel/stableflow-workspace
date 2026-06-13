# Análisis de Viabilidad: Onboarding con Lectura de Pasaporte vía NFC (eIDV)

Este documento analiza la viabilidad, ventajas, limitaciones y mejores prácticas de integrar la lectura de pasaportes electrónicos (ePassports) mediante tecnología NFC para el registro y validación de identidad (Tier 2 KYC) en **Spree (StableFlow)**.

---

## 1. ¿Cómo funciona la tecnología ePassports (NFC)?

Los pasaportes modernos (estándar ICAO Doc 9303) incluyen un chip RFID sin contacto que almacena de forma digital y encriptada los datos biográficos del usuario y una **fotografía digital de alta resolución** (mucha mayor calidad que la impresa en la página física).

Para leer este chip, se utiliza el siguiente protocolo de seguridad:
1. **MRZ Scan (Machine Readable Zone):** La cámara del celular lee las dos o tres líneas de caracteres alfanuméricos en la parte inferior de la hoja plástica del pasaporte. De aquí se extraen tres datos: número de pasaporte, fecha de nacimiento y fecha de vencimiento.
2. **Desbloqueo del Chip (BAC - Basic Access Control):** El SDK utiliza la combinación de esos tres datos para generar la clave criptográfica que permite desbloquear la antena NFC del pasaporte.
3. **Lectura NFC:** El teléfono debe estar físicamente pegado al pasaporte para transferir el archivo digital firmado por el gobierno emisor.
4. **Verificación de Autenticidad (PA - Passive Authentication):** El chip contiene una firma digital cifrada con una clave privada del país emisor. El SDK valida esta firma con las claves públicas de los gobiernos (ICAO PKD). Si la firma coincide, **se garantiza al 100% que el pasaporte es auténtico y no fue falsificado**.

---

## 2. Ventajas para Spree (StableFlow)

* **Seguridad Absoluta contra Fraude (Anti-Spoofing):** Las fotos de pasaportes enviadas tradicionalmente por cámara pueden ser alteradas digitalmente o tratarse de pasaportes falsos físicos muy realistas. La firma criptográfica del chip NFC es **infalsificable**.
* **Precisión en la Información:** El chip entrega los nombres, apellidos y número de documento exactamente como figuran en la base de datos oficial, eliminando errores de lectura de caracteres extraños (OCR tradicional con mala iluminación).
* **Foto Biométrica de Alta Calidad:** Se extrae la foto original directamente del chip en formato digital puro. Esto permite que el algoritmo de **Liveness Check** (Prueba de Vida mediante selfie) compare el rostro del usuario con una imagen de alta definición, reduciendo falsos rechazos en el onboarding.
* **Cumplimiento Regulatorio Robusto (AML/KYC):** Para liquidar fondos locales vía Bitso, Tapi o procesadores locales, debemos reportar datos fidedignos a las entidades financieras. El onboarding NFC cumple con los estándares mundiales más altos de KYC bancario.

---

## 3. Desafíos y Limitaciones Técnicas

* **Costo Financiero de los SDKs:** Los proveedores líderes (Regula, Incode, Jumio, Onfido) cobran un fee por cada transacción de validación exitosa (habitualmente entre **$1.00 y $2.50 USD**). Dado nuestro modelo de negocio de bajos márgenes por transacción, esto incrementa el coste de adquisición del cliente (CAC).
* **Restricción de Hardware (Fricción de Usuario):**
  * Algunos teléfonos Android de gama baja no disponen de antena NFC o los usuarios no saben cómo activarla.
  * En iPhones, aunque está soportado a partir del iPhone 7, requiere iOS 13+.
  * Posicionamiento físico: La lectura NFC puede interrumpirse si el usuario separa el pasaporte del celular antes de completar la lectura (tarda entre 5 y 15 segundos), generando frustración.
* **Privacidad y GDPR/LGPD:** Al extraer y almacenar datos de chips gubernamentales y biometría, debemos encriptar la base de datos de usuarios de Spree de punta a punta y definir políticas de retención estrictas (como el plazo de 5 años que detectamos en el análisis de WanderWallet).

---

## 4. Flujo de Onboarding Híbrido Recomendado

Para evitar perder usuarios durante el registro debido a fallas del NFC, proponemos implementar un **flujo híbrido inteligente**:

```
[ Registro de Usuario ] 
          │
          ▼
[ Escaneo MRZ de Pasaporte ] ───► ¿Celular tiene NFC y lee el Chip?
          │                                 │
     ┌────┴──────────────────────────┐      │ (Sí)
     │ (No / Falla Lectura)          ▼      ▼
     │                             [ Lectura NFC del Pasaporte ]
     ▼                             [ Extrae datos + Foto de Alta Res. ]
[ Captura Foto Física Completa ]            │
[ OCR Tradicional ]                         │
     │                                      │
     └───────────────────┬──────────────────┘
                         ▼
             [ Liveness Selfie Check ]
                         │
                         ▼
            [ Verificación e Ingreso ]
```

---

## 5. Proveedores Recomendados para Spree

Si decidimos avanzar en la integración de un SDK, evaluamos las siguientes opciones según nuestro contexto de negocio:

1. **Incode Omni (Recomendado para LATAM):**
   * *Por qué:* Es el líder en integración financiera en América Latina. Tienen adaptaciones locales excepcionales para bases de datos gubernamentales en México, Brasil, Argentina y Colombia. Su motor de biometría es sumamente rápido en conexiones de red móviles de LATAM.
2. **Regula Document Reader SDK (Recomendado para ePassports Globales):**
   * *Por qué:* Es la referencia técnica número uno en análisis de documentos a nivel forense. Si nuestro público objetivo son turistas europeos, asiáticos y norteamericanos, Regula tiene la base de datos de firmas gubernamentales más completa para validar chips NFC transnacionales.
3. **Onfido / Jumio (Alternativas Cloud-Native):**
   * *Por qué:* Excelentes SDKs listos para integrar mediante plataformas híbridas (Flutter/React Native). Poseen una gran automatización mediante IA para liveness checks rápidos.

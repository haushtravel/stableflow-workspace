# Análisis de Mercado LatAm y Viabilidad Financiera del Subsidio de Micropagos

Este documento evalúa los datos estadísticos del turismo receptivo en América Latina para modelar la viabilidad financiera de la estrategia de subsidio en micropagos (regla de exención de comisiones para montos ≤ $15 USDc) en **Spree**.

---

## 1. Análisis de Tráfico y Gasto por País

Basado en las estadísticas consolidadas, el comportamiento transaccional del turista extranjero varía drásticamente según el país de destino. Esto nos permite clasificar y priorizar nuestros mercados de lanzamiento:

```mermaid
quadrantChart
    title Priorización de Mercados de Lanzamiento para Spree
    x-axis Tráfico Bajo (Llegadas) --> Tráfico Alto (Llegadas)
    y-axis Gasto Diario Bajo --> Gasto Diario Alto
    "Chile ($63/día)": [0.55, 0.35]
    "Argentina ($83/día)": [0.54, 0.45]
    "Colombia ($103/día)": [0.65, 0.58]
    "Perú ($115/día)": [0.42, 0.65]
    "Brasil ($175/día)": [0.85, 0.85]
```

### Tabla Resumen de Métricas (Mercado Receptivo)
| País | Llegadas Anuales (Millones) | Gasto Diario Promedio (USD) | Riel de Pago Objetivo | Nivel de Fricción Cambiaria / Oportunidad Spree |
| :--- | :--- | :--- | :--- | :--- |
| **Brasil** | 9.3 | $175.00 | **Pix** | Alta penetración de Pix; alta disposición de gasto (especialmente de turistas de EE. UU./Europa). |
| **Colombia** | 6.5 | $103.20 | **Bre-B** / Transfiya | Mercado de rápido crecimiento (+5.7% en 2026); penetración móvil masiva. |
| **Argentina** | 5.3 | $83.60 | **Mercado Pago** / MODO | Fuerte brecha cambiaria histórica; los turistas buscan alternativas eficientes al efectivo. |
| **Perú** | 4.1 | $115.00 | **Yape** / Plin | Gasto promedio alto por turismo arqueológico/gastronómico premium. |
| **Chile** | 5.4 | $63.30 | **Redcompra** / QR local | Gasto diario moderado; infraestructura bancaria altamente formalizada. |

---

## 2. Modelado de Unit Economics (Caso de Estudio: Brasil)

Para validar si el subsidio del 0% en micropagos (≤ $15 USDc) es viable, realizamos una proyección de la economía unitaria para un turista promedio durante una estancia de **10 días en Brasil** con un presupuesto diario de **$175 USDc** (Total del viaje: **$1,750 USDc**).

### Distribución de Gasto Estimado
1.  **Consumo bajo el umbral (Micropagos ≤ $15 USDc)**: Cafés, transporte local (Uber, metro), snacks, propinas, entradas a museos.
    *   *Frecuencia diaria*: 8 transacciones de $7.00 USDc de promedio.
    *   *Gasto diario*: $56.00 USDc.
    *   *Total del viaje*: 80 transacciones (**$560.00 USDc**).
2.  **Consumo sobre el umbral (Macropagos > $15 USDc)**: Hoteles, cenas premium, tours (Civitatis), alquiler de autos.
    *   *Frecuencia diaria*: 1.5 transacciones de $79.33 USDc de promedio.
    *   *Gasto diario*: $119.00 USDc.
    *   *Total del viaje*: 15 transacciones (**$1,190.00 USDc**).

---

### Análisis de Ingresos y Costos Operativos

#### A. Ingresos por Comisiones (Revenue)
*   Comisión en Micropagos (≤ $15): **0%** = $0.00 USDc.
*   Comisión en Macropagos (> $15): **3%** sobre $1,190.00 USDc = **$35.70 USDc**.
*   *Ingreso Bruto Total*: **$35.70 USDc**.

#### B. Costos de Procesamiento Backend (Cost of Goods Sold - COGS)
*   **Costo de Fondeo Inbound (Bridge.xyz)**:
    *   Fondeo por transferencia ACH o SEPA (0.3% del total cargado): 0.3% de $1,750.00 = **$5.25 USDc**.
*   **Costo de Liquidación Local Outbound**:
    *   Asumimos un fee fijo de red por cada salida a Pix a través del proveedor local de off-ramp de **$0.05 USDc** por transacción (independientemente del monto).
    *   80 salidas de micropagos: 80 * $0.05 = **$4.00 USDc**.
    *   15 salidas de macropagos: 15 * $0.05 = **$0.75 USDc**.
*   *Costo Operativo Total*: $5.25 + $4.00 + $0.75 = **$10.00 USDc**.

#### C. Rentabilidad Neta para Spree
$$\text{Margen de Utilidad Bruta} = \text{Ingreso Bruto} - \text{Costo Operativo} = \$35.70 - \$10.00 = \$25.70\text{ USDc}$$
*   **Margen Operativo sobre el Volumen Total (Take Rate Neto)**: **1.47%** de los $1,750 USDc procesados.
*   **Margen de Utilidad sobre Ingresos**: **71.9%** de margen bruto.

---

## 3. Conclusiones y Recomendación Estratégica

Los datos empíricos de gasto y la estructura de costos blockchain/stablecoins respaldan la viabilidad del subsidio:

1.  **Efecto "Loss-Leader" Altamente Rentable**: Spree absorbe una pérdida controlada en los micropagos ($4.00 USDc de costo operativo neto en 80 transacciones) pero la compensa sobradamente con los macropagos del mismo usuario ($35.70 USDc recaudados).
2.  **Monopolización del Hábito del Viajero**: El principal obstáculo para que el turista digital use tarjetas tradicionales son los cargos mínimos fijos transfronterizos (ej. cargos fijos por transacción de $0.50 USD + 3% de conversión FX en consumos pequeños). Al eliminar esto, Spree se convierte en su herramienta por defecto.
3.  **Prioridad de Lanzamiento (Ruta LATAM)**:
    *   *Fase 1: Brasil (Pix)*: El mercado más grande, con mayor volumen de transacciones de alto ticket y un riel QR nativo e interoperable ya consolidado.
    *   *Fase 2: Argentina (Mercado Pago / MODO)*: Alta fricción cambiaría tradicional y una población de turistas muy dispuesta a usar métodos de pago alternativos para evitar efectivo físico.
    *   *Fase 3: Colombia (Bre-B) y Perú (Yape)*: Expansión conforme maduren los rieles nacionales unificados de pagos inmediatos.

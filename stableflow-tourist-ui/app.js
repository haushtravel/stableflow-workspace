// Spree Tourist UI Prototype Engine (iOS B&W Version)

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:8081'
  : '';

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'idem-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
}

async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('spree_session_token');
  options.headers = options.headers || {};
  
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  
  const isTransaction = url.includes('/api/wallet/preload') || 
                        url.includes('/api/wallet/checkout') || 
                        url.includes('/api/wallet/refund');
                        
  if (isTransaction && (options.method === 'POST' || options.method === 'PUT')) {
    if (!options.headers['Idempotency-Key']) {
      options.headers['Idempotency-Key'] = generateUUID();
    }
  }
  
  const response = await fetch(url, options);
  
  if (response.status === 401) {
    console.warn("Sesión inválida o expirada. Forzando cierre de sesión.");
    localStorage.removeItem('spree_session_token');
    
    // Cambiar a pantalla de onboarding
    switchScreen('screen-onboarding');
    
    // Ocultar barra de navegación inferior
    const bottomNav = document.getElementById('app-bottom-nav');
    if (bottomNav) {
      bottomNav.style.display = 'none';
    }
    
    // Mostrar paso 1 de onboarding
    const step1 = document.getElementById('onboarding-step-1');
    const step2 = document.getElementById('onboarding-step-2');
    if (step1 && step2) {
      step1.style.display = 'block';
      step2.style.display = 'none';
    }
  }
  
  return response;
}

// Estado de la aplicación
const savedProfile = localStorage.getItem('spree_profile');
const savedCompanions = localStorage.getItem('spree_companions');

const state = {
  balance: 0.00, // Comienza en $0 hasta la pre-carga
  country: 'ars', // 'ars' (Argentina) o 'brl' (Brasil)
  kycTier: 1, // 1: Express, 2: Documental
  transactions: [],
  lang: 'es',
  profile: savedProfile ? JSON.parse(savedProfile) : {
    name: 'Ian Taylor',
    passport: 'AA1234567',
    phone: '+1 555-0199',
    age: 30
  },
  companions: savedCompanions ? JSON.parse(savedCompanions) : []
};

// Cotizaciones mockeadas
const fxRates = {
  ars: 1200, // 1 USDc = 1200 ARS
  brl: 5 // 1 USDc = 5 BRL
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  setInterval(updateClock, 60000);
  
  initLanguage();
  initNavigation();
  initOnboarding();
  initKycOnboarding();
  initPreload();
  initDashboard();
  initCheckout();
  initRefund();
  initMarketplace();
  initSupport();
  initProfileScreen();
  
  // Siempre iniciar en la pantalla de onboarding
  localStorage.removeItem('spree_session_token');
  switchScreen('screen-onboarding');
  if (document.getElementById('app-bottom-nav')) {
    document.getElementById('app-bottom-nav').style.display = 'none';
  }
  
  // Sincronizar estado inicial con el backend de Go
  syncStateWithBackend();
});

// Función para sincronizar datos con el backend en Go
async function syncStateWithBackend() {
  try {
    const resBal = await fetchWithAuth(`${API_BASE}/api/wallet/balance`);
    if (resBal.ok) {
      const dataBal = await resBal.json();
      state.balance = dataBal.balance;
      if (dataBal.kyc_tier) {
        state.kycTier = dataBal.kyc_tier;
      }
      if (dataBal.rates) {
        fxRates.ars = dataBal.rates.ars;
        fxRates.brl = dataBal.rates.brl;
      }
    }
    
    const resTx = await fetchWithAuth(`${API_BASE}/api/wallet/transactions`);
    if (resTx.ok) {
      state.transactions = await resTx.json();
    }
    
    updateBalanceUI();
    renderTransactions();
  } catch (err) {
    console.warn("Backend Go no disponible aún, usando mocks locales:", err);
    updateBalanceUI();
    renderTransactions();
  }
}

// Reloj del Status Bar
function updateClock() {
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();
  minutes = minutes < 10 ? '0' + minutes : minutes;
  document.getElementById('status-time').innerText = `${hours}:${minutes}`;
}

// --- MANEJO DE NAVEGACIÓN ---
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetScreen = item.getAttribute('data-screen');
      switchScreen(targetScreen);
      
      // Update Active Nav Item
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

function switchScreen(screenId) {
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => s.classList.remove('active'));
  
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
  }
  
  // Sincronizaciones especiales al abrir pantallas
  if (screenId === 'screen-dashboard') {
    syncStateWithBackend();
  } else if (screenId === 'screen-refund') {
    document.getElementById('refund-balance-display').innerText = `$${state.balance.toFixed(2)} USDc`;
    const fee = state.balance * 0.015;
    const receive = state.balance - fee;
    document.getElementById('refund-fee-display').innerText = `$${fee.toFixed(2)} USDc`;
    document.getElementById('refund-receive-display').innerText = `$${receive.toFixed(2)} USD`;
    
    // Deshabilitar botón si el saldo es cero
    const btn = document.getElementById('btn-refund-execute');
    if (state.balance <= 0) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  } else if (screenId === 'screen-support') {
    if (window.initChatbotWelcome) {
      window.initChatbotWelcome();
    }
  } else if (screenId === 'screen-marketplace') {
    const activeTab = document.querySelector('.category-tab.active');
    const filter = activeTab ? activeTab.getAttribute('data-category') : 'all';
    renderMarketItems(filter, getToursSearchQuery(), getToursCityFilter());
  }
}

// --- FLUJO 1: ONBOARDING ---
function initOnboarding() {
  const btnSendOtp = document.getElementById('btn-send-otp');
  const btnVerifyOtp = document.getElementById('btn-verify-otp');
  const btnBackOtp = document.getElementById('btn-back-otp');
  const step1 = document.getElementById('onboarding-step-1');
  const step2 = document.getElementById('onboarding-step-2');
  
  btnSendOtp.addEventListener('click', async () => {
    const phone = document.getElementById('phone-number').value;
    const dict = translations[state.lang] || translations['es'];
    btnSendOtp.innerHTML = `${dict.js_sending_sms} <i class="fa-solid fa-spinner fa-spin"></i>`;
    btnSendOtp.disabled = true;
    
    try {
      const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      if (res.ok) {
        const data = await res.json();
        const helper = document.getElementById('otp-simulator-helper');
        
        if (data.twilio_active) {
          if (helper) {
            helper.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--ios-green);"></i> ${dict.otp_simulator_sent_twilio}`;
          }
          // Limpiar inputs para que el usuario escriba lo que le llegó
          const otpInputs = document.querySelectorAll('.otp-input');
          otpInputs.forEach(input => {
            input.value = "";
          });
        } else {
          if (data.code) {
            if (helper) {
              helper.innerText = dict.otp_simulator_sent.replace('{code}', data.code);
            }
            // Autorellenar los campos con el código recibido en modo simulación
            const otpInputs = document.querySelectorAll('.otp-input');
            otpInputs.forEach((input, index) => {
              input.value = data.code[index] || "";
            });
          } else {
            // El backend tiene hardening de seguridad, el código no se envía al frontend
            if (helper) {
              helper.innerHTML = `<i class="fa-solid fa-terminal" style="color: var(--ios-dark-gray);"></i> ${dict.otp_simulator_console || "Simulación activa: Revisa la consola del servidor Go para ver el código"}`;
            }
            // Limpiar inputs para escribir manualmente
            const otpInputs = document.querySelectorAll('.otp-input');
            otpInputs.forEach(input => {
              input.value = "";
            });
          }
        }
        
        step1.style.display = 'none';
        step2.style.display = 'block';
      } else {
        alert(dict.js_error_sending_otp);
      }
    } catch (err) {
      console.warn("Backend Go no disponible, usando simulación local (código 4930)");
      const helper = document.getElementById('otp-simulator-helper');
      if (helper) {
        helper.innerText = dict.otp_simulator_local;
      }
      const otpInputs = document.querySelectorAll('.otp-input');
      const mockCode = "4930";
      otpInputs.forEach((input, index) => {
        input.value = mockCode[index];
      });
      step1.style.display = 'none';
      step2.style.display = 'block';
    } finally {
      const dict = translations[state.lang] || translations['es'];
      btnSendOtp.innerHTML = `<span data-i18n="btn_send_otp">${dict.btn_send_otp}</span> <i class="fa-solid fa-arrow-right"></i>`;
      btnSendOtp.disabled = false;
    }
  });
  
  btnBackOtp.addEventListener('click', () => {
    step2.style.display = 'none';
    step1.style.display = 'block';
  });
  
  btnVerifyOtp.addEventListener('click', async () => {
    const dict = translations[state.lang] || translations['es'];
    const otpInputs = document.querySelectorAll('.otp-input');
    let code = '';
    otpInputs.forEach(i => code += i.value);
    
    const phone = document.getElementById('phone-number').value;
    
    btnVerifyOtp.innerHTML = `${dict.js_verifying} <i class="fa-solid fa-spinner fa-spin"></i>`;
    btnVerifyOtp.disabled = true;
    
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.token) {
          localStorage.setItem('spree_session_token', data.token);
        }
        showKycSelection();
        await syncStateWithBackend();
      } else {
        alert(data.message || dict.js_invalid_code);
      }
    } catch (err) {
      console.warn("Backend Go desconectado. Validando localmente para simulación.");
      if (code === "4930") {
        localStorage.setItem('spree_session_token', 'mock_token_4930');
        showKycSelection();
        updateBalanceUI();
        renderTransactions();
      } else {
        alert(dict.js_invalid_code_mock);
      }
    } finally {
      const dict = translations[state.lang] || translations['es'];
      btnVerifyOtp.innerHTML = `<span data-i18n="btn_verify_otp">${dict.btn_verify_otp}</span> <i class="fa-solid fa-check"></i>`;
      btnVerifyOtp.disabled = false;
    }
  });

  const otpInputs = document.querySelectorAll('.otp-input');
  otpInputs.forEach((input, index) => {
    input.addEventListener('keyup', (e) => {
      if (e.target.value.length === 1 && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }
    });
  });
}

// --- FLUJO 1-B: KYC TIERING & PASSPORT SCAN SIMULATION ---
let selectedKycTier = 1; // 1: Express, 2: Documental, 3: Nomad
let targetKycUpgrade = 2; // Nivel al que se quiere subir (2 o 3)

function showKycSelection() {
  const step2 = document.getElementById('onboarding-step-2');
  const step3 = document.getElementById('onboarding-step-3');
  if (step2 && step3) {
    step2.style.display = 'none';
    step3.style.display = 'block';
    
    // Select Tier 1 by default
    const optTier1 = document.getElementById('kyc-opt-tier1');
    const optTier2 = document.getElementById('kyc-opt-tier2');
    const optTier3 = document.getElementById('kyc-opt-tier3');
    if (optTier1 && optTier2 && optTier3) {
      optTier1.classList.add('selected');
      optTier2.classList.remove('selected');
      optTier3.classList.remove('selected');
      selectedKycTier = 1;
    }
  }
}

function initKycOnboarding() {
  const optTier1 = document.getElementById('kyc-opt-tier1');
  const optTier2 = document.getElementById('kyc-opt-tier2');
  const optTier3 = document.getElementById('kyc-opt-tier3');
  const btnKycAction = document.getElementById('btn-kyc-action');
  
  if (optTier1 && optTier2 && optTier3) {
    optTier1.addEventListener('click', () => {
      optTier1.classList.add('selected');
      optTier2.classList.remove('selected');
      optTier3.classList.remove('selected');
      selectedKycTier = 1;
      
      const dict = translations[state.lang] || translations['es'];
      btnKycAction.innerHTML = `<span>${dict.btn_continue_express || "Continuar con Nivel Express"}</span> <i class="fa-solid fa-arrow-right"></i>`;
    });
    
    optTier2.addEventListener('click', () => {
      optTier2.classList.add('selected');
      optTier1.classList.remove('selected');
      optTier3.classList.remove('selected');
      selectedKycTier = 2;
      targetKycUpgrade = 2;
      
      const dict = translations[state.lang] || translations['es'];
      btnKycAction.innerHTML = `<span>${dict.btn_verify_passport || "Verificar Pasaporte (Nivel Completo)"}</span> <i class="fa-solid fa-arrow-right"></i>`;
    });

    optTier3.addEventListener('click', () => {
      optTier3.classList.add('selected');
      optTier1.classList.remove('selected');
      optTier2.classList.remove('selected');
      selectedKycTier = 3;
      targetKycUpgrade = 3;
      
      const dict = translations[state.lang] || translations['es'];
      btnKycAction.innerHTML = `<span>${dict.kyc_verify_nfc_btn || "Verificar Pasaporte NFC (Nivel Nómada)"}</span> <i class="fa-solid fa-arrow-right"></i>`;
    });
  }
  
  if (btnKycAction) {
    btnKycAction.addEventListener('click', async () => {
      if (selectedKycTier === 1) {
        state.kycTier = 1;
        await saveKycTierOnBackend(1);
        finishOnboarding();
      } else {
        const step3 = document.getElementById('onboarding-step-3');
        const step4 = document.getElementById('onboarding-step-4');
        if (step3 && step4) {
          step3.style.display = 'none';
          step4.style.display = 'block';
          resetPassportScanUI();
        }
      }
    });
  }
  
  const btnBackToKycSelect = document.getElementById('btn-back-to-kyc-select');
  if (btnBackToKycSelect) {
    btnBackToKycSelect.addEventListener('click', () => {
      const step3 = document.getElementById('onboarding-step-3');
      const step4 = document.getElementById('onboarding-step-4');
      if (step3 && step4) {
        step4.style.display = 'none';
        step3.style.display = 'block';
      }
    });
  }
  
  const btnStartPassportScan = document.getElementById('btn-start-passport-scan');
  if (btnStartPassportScan) {
    btnStartPassportScan.addEventListener('click', () => {
      if (btnStartPassportScan.getAttribute('data-finished') === 'true') {
        finishOnboarding();
      } else {
        runPassportScanSimulation();
      }
    });
  }
}

async function saveKycTierOnBackend(tier) {
  try {
    const token = localStorage.getItem('spree_session_token');
    await fetch(`${API_BASE}/api/wallet/kyc`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ tier })
    });
  } catch (err) {
    console.warn("No se pudo sincronizar el KYC tier con el backend Go.");
  }
}

function finishOnboarding() {
  switchScreen('screen-dashboard');
  document.getElementById('app-bottom-nav').style.display = 'flex';
  
  const step1 = document.getElementById('onboarding-step-1');
  const step2 = document.getElementById('onboarding-step-2');
  const step3 = document.getElementById('onboarding-step-3');
  const step4 = document.getElementById('onboarding-step-4');
  if (step1) step1.style.display = 'block';
  if (step2) step2.style.display = 'none';
  if (step3) step3.style.display = 'none';
  if (step4) step4.style.display = 'none';
}

function resetPassportScanUI() {
  const btn = document.getElementById('btn-start-passport-scan');
  if (btn) {
    btn.removeAttribute('data-finished');
    btn.disabled = false;
    const dict = translations[state.lang] || translations['es'];
    btn.innerText = dict.btn_start_scan || "Escanear Zona MRZ";
  }
  
  const cam = document.getElementById('passport-scan-cam');
  const nfc = document.getElementById('passport-scan-nfc');
  const success = document.getElementById('passport-scan-success');
  const laser = document.getElementById('scan-laser-line');
  const log = document.getElementById('passport-scan-log');
  
  if (cam) cam.style.display = 'flex';
  if (nfc) nfc.style.display = 'none';
  if (success) success.style.display = 'none';
  if (laser) laser.style.display = 'none';
  if (log) log.innerHTML = `&gt; Esperando inicio...`;
}

function runPassportScanSimulation() {
  const btn = document.getElementById('btn-start-passport-scan');
  const log = document.getElementById('passport-scan-log');
  const laser = document.getElementById('scan-laser-line');
  const cam = document.getElementById('passport-scan-cam');
  const nfc = document.getElementById('passport-scan-nfc');
  
  if (btn) btn.disabled = true;
  
  const isEs = state.lang === 'es';

  if (targetKycUpgrade === 2) {
    // Escaneo de Pasaporte OCR + Liveness (Tier 2)
    if (laser) laser.style.display = 'block';
    log.innerHTML = isEs ? "&gt; Iniciando cámara..." : "&gt; Starting camera...";
    
    const messages = [
      { t: 800, msg: isEs ? "&gt; Buscando zona MRZ en la página de datos..." : "&gt; Searching for MRZ zone on the data page..." },
      { t: 1600, msg: isEs ? "&gt; <span style='color: var(--success-color); font-weight: 500;'>[OK] Zona MRZ detectada:</span> P&lt;USA&lt;&lt;SMITH&lt;&lt;JOHN&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;" : "&gt; <span style='color: var(--success-color); font-weight: 500;'>[OK] MRZ Zone detected:</span> P&lt;USA&lt;&lt;SMITH&lt;&lt;JOHN&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;" },
      { t: 2400, msg: isEs ? "&gt; <span style='color: var(--success-color); font-weight: 500;'>[OK] Pasaporte nº YA1234567</span>, Nacionalidad: USA, Nacimiento: 23/04/1988" : "&gt; <span style='color: var(--success-color); font-weight: 500;'>[OK] Passport No. YA1234567</span>, Nationality: USA, DOB: 23/04/1988" },
      { t: 3200, msg: isEs ? "&gt; Analizando holograma tridimensional y marca de agua física..." : "&gt; Analyzing three-dimensional hologram and physical watermark..." },
      { t: 4000, msg: isEs ? "&gt; Iniciando prueba de vida facial (Selfie Video Liveness Check)..." : "&gt; Starting facial liveness check (Selfie Video Liveness Check)..." },
      { t: 4800, msg: isEs ? "&gt; Análisis biometria activa contra IA generativa (ZOLOZ Deeper)..." : "&gt; Active biometric analysis against generative AI (ZOLOZ Deeper)..." },
      { t: 5600, msg: "OCR_FINISH" }
    ];

    messages.forEach(item => {
      setTimeout(() => {
        if (item.msg === "OCR_FINISH") {
          if (laser) laser.style.display = 'none';
          
          log.innerHTML += isEs 
            ? `<br>&gt; <span style='color: var(--success-color); font-weight: 500;'>[OK] Prueba de vida completada. Rostro coincide en 99.7%.</span>`
            : `<br>&gt; <span style='color: var(--success-color); font-weight: 500;'>[OK] Liveness check completed. Face match 99.7%.</span>`;
          
          log.innerHTML += isEs
            ? `<br>&gt; <span style='color: var(--success-color); font-weight: 700;'>¡VERIFICACIÓN COMPLETA! Cuenta promovida a Nivel Completo (Tier 2).</span>`
            : `<br>&gt; <span style='color: var(--success-color); font-weight: 700;'>¡VERIFICATION COMPLETE! Account promoted to Full Access (Tier 2).</span>`;
          log.scrollTop = log.scrollHeight;
          
          completeKycUpgrade(2);
        } else {
          log.innerHTML += `<br>${item.msg}`;
          log.scrollTop = log.scrollHeight;
        }
      }, item.t);
    });
  } else {
    // Lectura Criptográfica de Chip NFC (Tier 3)
    if (laser) laser.style.display = 'block';
    log.innerHTML = isEs ? "&gt; Iniciando lector NFC eIDV..." : "&gt; Starting eIDV NFC reader...";
    
    const messages = [
      { t: 800, msg: isEs ? "&gt; Buscando zona de lectura mecánica (MRZ) para derivar clave..." : "&gt; Searching for MRZ zone to derive access key..." },
      { t: 1600, msg: isEs ? "&gt; <span style='color: var(--success-color); font-weight: 500;'>[OK] Zona MRZ detectada:</span> P&lt;ITA&lt;&lt;ROSSI&lt;&lt;MARIO&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;" : "&gt; <span style='color: var(--success-color); font-weight: 500;'>[OK] MRZ Zone detected:</span> P&lt;ITA&lt;&lt;ROSSI&lt;&lt;MARIO&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;" },
      { t: 2400, msg: isEs ? "&gt; Extrayendo llaves de Control de Acceso Básico (BAC) y PACE..." : "&gt; Extracting Basic Access Control (BAC) and PACE keys..." },
      { t: 3200, msg: isEs ? "&gt; Inicializando canal criptográfico de chip NFC..." : "&gt; Initializing cryptographic channel on NFC chip..." },
      { t: 4000, msg: "NFC_STAGE" }
    ];

    messages.forEach(item => {
      setTimeout(() => {
        if (item.msg === "NFC_STAGE") {
          if (laser) laser.style.display = 'none';
          if (cam) cam.style.display = 'none';
          if (nfc) nfc.style.display = 'flex';
          
          log.innerHTML += isEs 
            ? `<br>&gt; <span style='color: var(--success-color);'>Por favor, sostén el pasaporte contra la parte trasera del teléfono...</span>`
            : `<br>&gt; <span style='color: var(--success-color);'>Please hold the passport against the back of your phone...</span>`;
          log.scrollTop = log.scrollHeight;
          
          runNfcReadingSimulation();
        } else {
          log.innerHTML += `<br>${item.msg}`;
          log.scrollTop = log.scrollHeight;
        }
      }, item.t);
    });
  }
}

// --- SIMULACIÓN DE LECTURA NFC ---
function runNfcReadingSimulation() {
  const log = document.getElementById('passport-scan-log');
  const nfc = document.getElementById('passport-scan-nfc');
  const success = document.getElementById('passport-scan-success');
  
  const isEs = state.lang === 'es';

  const messages = [
    { t: 1000, msg: isEs ? "&gt; Conexión NFC establecida con éxito." : "&gt; NFC connection established successfully." },
    { t: 1800, msg: isEs ? "&gt; Descifrando Datos de Grupo 1 (Detalles Biográficos)... [OK]" : "&gt; Decrypting Data Group 1 (Biographical Details)... [OK]" },
    { t: 2600, msg: isEs ? "&gt; Leyendo Datos de Grupo 2 (Imagen Facial del Titular en Alta Res.)... [OK]" : "&gt; Reading Data Group 2 (High Res. Holder Facial Image)... [OK]" },
    { t: 3400, msg: isEs ? "&gt; Validando firmas digitales del chip mediante claves soberanas..." : "&gt; Validating chip digital signatures via sovereign keys..." },
    { t: 4200, msg: isEs ? "&gt; Verificando Autenticación Pasiva (PA) y Autenticación Activa (AA)... [OK]" : "&gt; Verifying Passive Authentication (PA) and Active Authentication (AA)... [OK]" },
    { t: 5000, msg: isEs ? "&gt; Cruce de datos con listas de control PEP / OFAC internacionales... Limpio." : "&gt; Data cross-reference with international PEP / OFAC watchlist... Clean." },
    { t: 5800, msg: isEs ? "&gt; <span style='color: var(--success-color); font-weight: 700;'>¡VERIFICACIÓN COMPLETA! Cuenta promovida a Nivel Nómada (Tier 3).</span>" : "&gt; <span style='color: var(--success-color); font-weight: 700;'>¡VERIFICATION COMPLETE! Account promoted to Nomad Level (Tier 3).</span>" }
  ];
  
  messages.forEach(item => {
    setTimeout(async () => {
      log.innerHTML += `<br>${item.msg}`;
      log.scrollTop = log.scrollHeight;
      
      if (item.t === 5800) {
        if (nfc) nfc.style.display = 'none';
        if (success) success.style.display = 'flex';
        
        completeKycUpgrade(3);
      }
    }, item.t);
  });
}

async function completeKycUpgrade(tier) {
  const btn = document.getElementById('btn-start-passport-scan');
  state.kycTier = tier;
  await saveKycTierOnBackend(tier);
  
  // Actualizar UI del perfil
  updateProfileKycUI();

  if (btn) {
    btn.disabled = false;
    btn.setAttribute('data-finished', 'true');
    const dict = translations[state.lang] || translations['es'];
    btn.innerText = dict.btn_success_close || "Finalizar y Entrar";
  }
}

function updateProfileKycUI() {
  const tierNameEl = document.getElementById('profile-kyc-tier-name');
  const limitsEl = document.getElementById('profile-kyc-tier-limits');
  const badgeEl = document.getElementById('profile-kyc-badge');
  const btnUpgrade = document.getElementById('btn-profile-upgrade-kyc');
  const upgradeTextEl = document.getElementById('btn-profile-upgrade-text');

  if (!tierNameEl || !limitsEl || !badgeEl || !btnUpgrade || !upgradeTextEl) return;

  const isEs = state.lang === 'es';

  if (state.kycTier === 1) {
    tierNameEl.innerText = isEs ? "Acceso Express (Tier 1)" : "Express Access (Tier 1)";
    limitsEl.innerText = isEs ? "Límite por pago: $20 USDc / Total: $250 USDc" : "Limit per payment: $20 USDc / Total: $250 USDc";
    badgeEl.innerText = "Tier 1";
    badgeEl.className = "kyc-option-badge active";
    btnUpgrade.style.display = 'flex';
    btnUpgrade.disabled = false;
    btnUpgrade.style.opacity = '1';
    upgradeTextEl.innerText = isEs ? "Subir a Nivel Completo (Tier 2)" : "Upgrade to Full Access (Tier 2)";
  } else if (state.kycTier === 2) {
    tierNameEl.innerText = isEs ? "Nivel Completo (Tier 2)" : "Full Access (Tier 2)";
    limitsEl.innerText = isEs ? "Límite: $2,000 USDc/mes" : "Limit: $2,000 USDc/month";
    badgeEl.innerText = "Tier 2";
    badgeEl.className = "kyc-option-badge recommend";
    btnUpgrade.style.display = 'flex';
    btnUpgrade.disabled = false;
    btnUpgrade.style.opacity = '1';
    upgradeTextEl.innerText = isEs ? "Subir a Nivel Nómada (Tier 3)" : "Upgrade to Nomad Access (Tier 3)";
  } else if (state.kycTier === 3) {
    tierNameEl.innerText = isEs ? "Nivel Nómada (Tier 3)" : "Nomad Access (Tier 3)";
    limitsEl.innerText = isEs ? "Límite: $10,000 USDc/mes" : "Limit: $10,000 USDc/month";
    badgeEl.innerText = "Tier 3";
    badgeEl.className = "kyc-option-badge recommend";
    btnUpgrade.style.display = 'flex';
    btnUpgrade.disabled = true;
    btnUpgrade.style.opacity = '0.6';
    upgradeTextEl.innerText = isEs ? "Verificado al Máximo Nivel" : "Verified to Maximum Level";
  }
};

let selectedPreloadAmount = 200;
let selectedPaymentType = 'googlepay'; // 'googlepay' o 'card'
let selectedPreloadCardId = 'card_initial';
let stripePublishableKey = '';

const savedCards = [
  { id: 'card_initial', brand: 'visa', last4: '4321', holder: 'SANPAOLO DEBIT', token: 'tok_simulado_initial' }
];

async function fetchStripeConfig() {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    if (res.ok) {
      const data = await res.json();
      stripePublishableKey = data.stripe_publishable_key;
      if (stripePublishableKey) {
        console.log("Stripe Publishable Key cargada correctamente:", stripePublishableKey);
      }
    }
  } catch (err) {
    console.warn("No se pudo cargar la clave pública de Stripe del backend:", err);
  }
}

function initPreload() {
  // Cargar clave de Stripe al iniciar la pantalla
  fetchStripeConfig();

  const amountBtns = document.querySelectorAll('.amount-btn');
  const customAmountInput = document.getElementById('custom-amount');
  const payOptions = document.querySelectorAll('#preload-pay-methods .pay-option');
  const btnPreloadConfirm = document.getElementById('btn-preload-confirm');
  
  amountBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      amountBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      
      selectedPreloadAmount = parseInt(btn.getAttribute('data-value'));
      customAmountInput.value = selectedPreloadAmount;
    });
  });
  
  customAmountInput.addEventListener('input', (e) => {
    amountBtns.forEach(b => b.classList.remove('selected'));
    selectedPreloadAmount = parseFloat(e.target.value) || 0;
  });
  
  payOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      payOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      
      selectedPaymentType = opt.getAttribute('data-type');
      const cardSection = document.getElementById('card-manager-section');
      const bankSection = document.getElementById('bank-transfer-section');
      
      if (selectedPaymentType === 'card') {
        if (cardSection) cardSection.style.display = 'block';
        if (bankSection) bankSection.style.display = 'none';
        renderSavedCards();
      } else if (selectedPaymentType === 'bank') {
        if (cardSection) cardSection.style.display = 'none';
        if (bankSection) bankSection.style.display = 'block';
        initBankTabs();
      } else {
        if (cardSection) cardSection.style.display = 'none';
        if (bankSection) bankSection.style.display = 'none';
      }
    });
  });

  function initBankTabs() {
    const tabBtns = document.querySelectorAll('.bank-tab-btn');
    const usDetails = document.getElementById('bank-details-us');
    const euDetails = document.getElementById('bank-details-eu');
    
    if (tabBtns.length === 0) return;
    if (window.bankTabsInitialized) return;
    window.bankTabsInitialized = true;

    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        tabBtns.forEach(b => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.color = 'var(--text-muted)';
          b.style.borderColor = 'transparent';
        });
        
        btn.classList.add('active');
        btn.style.background = 'rgba(255,255,255,0.05)';
        btn.style.color = '#fff';
        btn.style.borderColor = 'var(--divider-color)';
        
        const type = btn.getAttribute('data-bank');
        if (type === 'us') {
          if (usDetails) usDetails.style.display = 'block';
          if (euDetails) euDetails.style.display = 'none';
        } else {
          if (usDetails) usDetails.style.display = 'none';
          if (euDetails) euDetails.style.display = 'block';
        }
      });
    });
  }


  // --- GESTIÓN DE TARJETAS ---
  function renderSavedCards() {
    const list = document.getElementById('saved-cards-list');
    if (!list) return;
    list.innerHTML = '';
    
    const dict = translations[state.lang] || translations['es'];
    if (savedCards.length === 0) {
      list.innerHTML = `<div style="font-size:0.75rem; color:var(--text-muted); padding: 8px; text-align:center;">${dict.js_no_cards_saved}</div>`;
      return;
    }
    
    savedCards.forEach(card => {
      const cell = document.createElement('div');
      cell.className = `saved-card-cell ${selectedPreloadCardId === card.id ? 'selected' : ''}`;
      cell.setAttribute('data-id', card.id);
      
      let iconHTML = '<i class="fa-solid fa-credit-card" style="font-size: 1.2rem;"></i>';
      if (card.brand === 'visa') {
        iconHTML = '<i class="fa-brands fa-cc-visa" style="font-size: 1.2rem; color: #FFF;"></i>';
      } else if (card.brand === 'mastercard') {
        iconHTML = '<i class="fa-brands fa-cc-mastercard" style="font-size: 1.2rem; color: #FF5F00;"></i>';
      }
      
      cell.innerHTML = `
        <div class="card-info">
          ${iconHTML}
          <span>${card.holder} •••• ${card.last4}</span>
        </div>
        <div class="card-actions">
          <button class="btn-delete-card" title="Eliminar tarjeta">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `;
      
      cell.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-card')) return;
        selectedPreloadCardId = card.id;
        renderSavedCards();
        updateActiveCardLabel();
      });
      
      cell.querySelector('.btn-delete-card').addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = savedCards.findIndex(c => c.id === card.id);
        if (idx !== -1) {
          savedCards.splice(idx, 1);
          if (selectedPreloadCardId === card.id) {
            selectedPreloadCardId = savedCards.length > 0 ? savedCards[0].id : null;
          }
          renderSavedCards();
          updateActiveCardLabel();
        }
      });
      
      list.appendChild(cell);
    });
  }

  function updateActiveCardLabel() {
    const label = document.getElementById('active-card-label');
    if (!label) return;
    if (selectedPreloadCardId) {
      const card = savedCards.find(c => c.id === selectedPreloadCardId);
      if (card) {
        label.innerText = `${card.holder} •••• ${card.last4}`;
        return;
      }
    }
    const dict = translations[state.lang] || translations['es'];
    label.innerText = dict.js_select_or_add_card;
  }
  window.updateActiveCardLabel = updateActiveCardLabel;

  // Inputs & Formulario interactivo
  const addToggleBtn = document.getElementById('btn-add-card-toggle');
  const formContainer = document.getElementById('card-form-container');
  const cancelBtn = document.getElementById('btn-cancel-card');
  const saveBtn = document.getElementById('btn-save-card');
  
  const holderInput = document.getElementById('card-holder-input');
  const numberInput = document.getElementById('card-number-input');
  const expiryInput = document.getElementById('card-expiry-input');
  const cvcInput = document.getElementById('card-cvc-input');
  
  const displayNum = document.getElementById('vcard-number-display');
  const displayName = document.getElementById('vcard-name-display');
  const displayExpiry = document.getElementById('vcard-expiry-display');
  const logo = document.getElementById('vcard-logo');
  
  function resetCardForm() {
    holderInput.value = '';
    numberInput.value = '';
    expiryInput.value = '';
    cvcInput.value = '';
    displayNum.innerText = '•••• •••• •••• ••••';
    displayName.innerText = 'NOMBRE APELLIDO';
    displayExpiry.innerText = 'MM/YY';
    logo.className = 'fa-solid fa-credit-card';
    logo.style.color = '#FFF';
  }

  if (addToggleBtn) {
    addToggleBtn.addEventListener('click', () => {
      formContainer.style.display = 'block';
      
      // Ocultar resto de elementos para evitar scroll y que todo quepa en la pantalla del mockup
      const mainFlow = document.getElementById('preload-main-flow');
      if (mainFlow) mainFlow.style.display = 'none';
      const savedCardsView = document.getElementById('saved-cards-view');
      if (savedCardsView) savedCardsView.style.display = 'none';
      if (btnPreloadConfirm) btnPreloadConfirm.style.display = 'none';
      
      resetCardForm();
    });
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      formContainer.style.display = 'none';
      
      // Restaurar flujo principal
      const mainFlow = document.getElementById('preload-main-flow');
      if (mainFlow) mainFlow.style.display = 'block';
      const savedCardsView = document.getElementById('saved-cards-view');
      if (savedCardsView) savedCardsView.style.display = 'block';
      if (btnPreloadConfirm) btnPreloadConfirm.style.display = 'flex';
    });
  }

  // Formateadores interactivos
  if (holderInput) {
    holderInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
      displayName.innerText = e.target.value || 'NOMBRE APELLIDO';
    });
  }

  if (numberInput) {
    numberInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
      let formatted = '';
      for (let i = 0; i < value.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += ' ';
        formatted += value[i];
      }
      e.target.value = formatted;
      displayNum.innerText = formatted || '•••• •••• •••• ••••';
      
      if (value.startsWith('4')) {
        logo.className = 'fa-brands fa-cc-visa';
        logo.style.color = '#FFF';
      } else if (value.startsWith('5')) {
        logo.className = 'fa-brands fa-cc-mastercard';
        logo.style.color = '#FF5F00';
      } else {
        logo.className = 'fa-solid fa-credit-card';
        logo.style.color = '#FFF';
      }
    });
  }

  if (expiryInput) {
    expiryInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\//g, '').replace(/[^0-9]/gi, '');
      if (value.length > 2) {
        e.target.value = value.substring(0, 2) + '/' + value.substring(2, 4);
      } else {
        e.target.value = value;
      }
      displayExpiry.innerText = e.target.value || 'MM/YY';
    });
  }

  function showCardError(msg) {
    console.warn("[CardManager] Error de validación:", msg);
    const errorDiv = document.getElementById('card-form-error');
    if (errorDiv) {
      errorDiv.innerText = msg;
      errorDiv.style.display = 'block';
    } else {
      alert(msg);
    }
  }

  // Guardar y Tokenizar tarjeta
  if (saveBtn) {
    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      const holder = holderInput.value.trim();
      const num = numberInput.value.replace(/\s+/g, '');
      const exp = expiryInput.value.trim();
      const cvc = cvcInput.value.trim();
      
      const errorDiv = document.getElementById('card-form-error');
      if (errorDiv) {
        errorDiv.style.display = 'none';
        errorDiv.innerText = '';
      }
      
      console.log("[CardManager] Intentando guardar tarjeta:", { holder, numLen: num.length, exp, cvcLen: cvc.length });
      
      const dict = translations[state.lang] || translations['es'];
      if (!holder) {
        showCardError(dict.js_err_card_holder);
        return;
      }
      if (num.length < 16) {
        showCardError(dict.js_err_card_number);
        return;
      }
      if (exp.length < 5) {
        showCardError(dict.js_err_card_expiry);
        return;
      }
      if (cvc.length < 3) {
        showCardError(dict.js_err_card_cvc);
        return;
      }
      
      saveBtn.innerHTML = `${dict.js_tokenizing} <i class="fa-solid fa-spinner fa-spin"></i>`;
      saveBtn.disabled = true;
      
      if (stripePublishableKey) {
        try {
          console.log("[Stripe SDK] Enviando datos a tokenizar...");
          const expParts = exp.split('/');
          const month = expParts[0];
          const year = '20' + expParts[1];
          
          const body = new URLSearchParams();
          body.set('card[number]', num);
          body.set('card[exp_month]', month);
          body.set('card[exp_year]', year);
          body.set('card[cvc]', cvc);
          body.set('card[name]', holder);
          
          const response = await fetch('https://api.stripe.com/v1/tokens', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${stripePublishableKey}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
          });
          
          if (response.ok) {
            const stripeRes = await response.json();
            const newCard = {
              id: 'card_' + Date.now(),
              brand: stripeRes.card.brand.toLowerCase(),
              last4: stripeRes.card.last4,
              holder: holder,
              token: stripeRes.id
            };
            savedCards.push(newCard);
            selectedPreloadCardId = newCard.id;
            
            console.log("[Stripe SDK] Tokenizado exitoso:", stripeRes.id);
            formContainer.style.display = 'none';
            
            // Restaurar flujo principal
            const mainFlow = document.getElementById('preload-main-flow');
            if (mainFlow) mainFlow.style.display = 'block';
            const savedCardsView = document.getElementById('saved-cards-view');
            if (savedCardsView) savedCardsView.style.display = 'block';
            if (btnPreloadConfirm) btnPreloadConfirm.style.display = 'flex';
            
            renderSavedCards();
            updateActiveCardLabel();
          } else {
            const errData = await response.json();
            showCardError(dict.js_err_stripe + (errData.error?.message || dict.js_err_stripe_tokenization));
          }
        } catch (err) {
          console.error("Error al conectar con Stripe:", err);
          showCardError(dict.js_err_stripe_network);
          addMockCard(holder, num);
        } finally {
          const dict = translations[state.lang] || translations['es'];
          saveBtn.innerHTML = dict.btn_save_card;
          saveBtn.disabled = false;
        }
      } else {
        // Simulación offline
        console.log("[CardManager] Stripe inactivo, procediendo con token simulado en 800ms...");
        setTimeout(() => {
          addMockCard(holder, num);
        }, 800);
      }
    });
  }

  function addMockCard(holder, num) {
    const brand = num.startsWith('5') ? 'mastercard' : 'visa';
    const last4 = num.substring(num.length - 4);
    const mockToken = 'tok_simulado_' + Math.random().toString(36).substring(2, 9);
    
    const newCard = {
      id: 'card_' + Date.now(),
      brand,
      last4,
      holder,
      token: mockToken
    };
    savedCards.push(newCard);
    selectedPreloadCardId = newCard.id;
    
    formContainer.style.display = 'none';
    
    // Restaurar flujo principal
    const mainFlow = document.getElementById('preload-main-flow');
    if (mainFlow) mainFlow.style.display = 'block';
    const savedCardsView = document.getElementById('saved-cards-view');
    if (savedCardsView) savedCardsView.style.display = 'block';
    if (btnPreloadConfirm) btnPreloadConfirm.style.display = 'flex';
    
    renderSavedCards();
    updateActiveCardLabel();
    
    const dict = translations[state.lang] || translations['es'];
    saveBtn.innerHTML = dict.btn_save_card;
    saveBtn.disabled = false;
  }

  btnPreloadConfirm.addEventListener('click', () => {
    if (selectedPreloadAmount <= 0) return;
    
    const dict = translations[state.lang] || translations['es'];
    
    if (selectedPaymentType === 'bank') {
      const loadingTitle = dict.js_simulating_bank_transfer || "Simulando depósito...";
      const loadingDesc = dict.js_processing_bank_deposit || "Bridge.xyz procesa tu depósito ACH/SEPA y acredita en Polygon (costo adquirente de tarjeta: 0%).";
      
      triggerProcessingScreen(loadingTitle, loadingDesc, async () => {
        try {
          const res = await fetchWithAuth(`${API_BASE}/api/wallet/preload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              amount: selectedPreloadAmount, 
              payment_method: 'bank',
              token: 'bank_simulated'
            })
          });
          
          if (res.ok) {
            const data = await res.json();
            state.balance = data.balance;
            await syncStateWithBackend();
            
            showSuccessScreen(
              dict.js_preload_success_title || "¡Carga Exitosa!", 
              dict.js_preload_success_desc.replace('${amount}', data.received_USDc.toFixed(2)),
              `
              <strong>${dict.details_host_tx || 'Transacción Host'}:</strong> ${data.tx_id}<br>
              <strong>${dict.details_crypto_network || 'Red Cripto'}:</strong> Polygon (USDc)<br>
              <strong>${dict.details_amount_charged || 'Monto Depositado'}:</strong> $${selectedPreloadAmount.toFixed(2)} USD/EUR<br>
              <strong>${dict.details_preload_fee || 'Comisión de Carga (0.3% Bridge)'}:</strong> $${(selectedPreloadAmount * 0.003).toFixed(2)} USDc<br>
              <strong>${dict.details_amount_credited || 'Monto Acreditado'}:</strong> $${data.received_USDc.toFixed(2)} USDc<br>
              <strong>${dict.details_available_balance || 'Saldo Disponible'}:</strong> $${state.balance.toFixed(2)} USDc
              `
            );
          } else {
            const errData = await res.json();
            alert("Error: " + (errData.message || "Preload failed."));
            switchScreen('screen-dashboard');
          }
        } catch (err) {
          console.warn("Backend Go desconectado. Realizando carga bancaria simulada local.");
          const fee = selectedPreloadAmount * 0.003;
          const netReceived = selectedPreloadAmount - fee;
          state.balance += netReceived;
          state.transactions.unshift({
            id: "tr_bridge_" + Math.floor(Math.random() * 1000000),
            merchant: "Depósito Bancario (Bridge)",
            fiat: selectedPreloadAmount.toFixed(2),
            fiat_symbol: "$",
            USDc: netReceived.toFixed(2),
            type: "load",
            date: "Hoy",
            status: "Completado"
          });
          
          showSuccessScreen(
            dict.js_preload_success_title_local, 
            dict.js_preload_success_desc_local.replace('${amount}', netReceived.toFixed(2)),
            `
            <strong>${dict.details_host_tx || 'Transacción Host'}:</strong> tr_bridge_${Math.floor(Math.random() * 1000000)}<br>
            <strong>${dict.details_crypto_network || 'Red Cripto'}:</strong> Polygon (USDc)<br>
            <strong>${dict.details_amount_charged || 'Monto Depositado'}:</strong> $${selectedPreloadAmount.toFixed(2)} USD/EUR<br>
            <strong>${dict.details_preload_fee || 'Comisión de Carga (0.3% Bridge)'}:</strong> $${fee.toFixed(2)} USDc<br>
            <strong>${dict.details_amount_credited || 'Monto Acreditado'}:</strong> $${netReceived.toFixed(2)} USDc<br>
            <strong>${dict.details_available_balance || 'Saldo Disponible'}:</strong> $${state.balance.toFixed(2)} USDc
            `
          );
          updateBalanceUI();
          renderTransactions();
        }
      });
      return;
    }
    
    if (selectedPaymentType === 'card' && !selectedPreloadCardId) {
      alert(dict.js_select_card_error);
      return;
    }
    
    // Configurar modal bancario 3DS2 con datos de tarjeta seleccionada
    let cardLabel = "Apple Pay / Google Pay";
    if (selectedPaymentType === 'card') {
      const card = savedCards.find(c => c.id === selectedPreloadCardId);
      if (card) {
        cardLabel = `${card.holder} (${card.brand.toUpperCase()}) •••• ${card.last4}`;
      }
    }
    
    document.getElementById('bank-modal-amount').innerText = `$${selectedPreloadAmount.toFixed(2)} USD`;
    const sub = document.querySelector('.bank-modal .bank-body p + div');
    if (sub) {
      sub.innerText = `Titular: ${cardLabel}`;
    }
    document.getElementById('bank-modal-overlay').classList.add('active');
  });
  
  const btnBankConfirm = document.getElementById('btn-bank-confirm');
  const btnBankCancel = document.getElementById('btn-bank-cancel');
  
  btnBankConfirm.addEventListener('click', () => {
    const dict = translations[state.lang] || translations['es'];
    document.getElementById('bank-modal-overlay').classList.remove('active');
    triggerProcessingScreen(dict.js_preloading_balance, dict.js_authorizing_preload, async () => {
      
      const selectedCard = savedCards.find(c => c.id === selectedPreloadCardId);
      const tokenToSend = selectedPaymentType === 'card' && selectedCard ? selectedCard.token : 'tok_simulado_applepay';
      
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/wallet/preload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            amount: selectedPreloadAmount, 
            payment_method: selectedPaymentType,
            token: tokenToSend
          })
        });
        
        if (res.ok) {
          const data = await res.json();
          state.balance = data.balance;
          await syncStateWithBackend();
          
          showSuccessScreen(
            dict.js_preload_success_title, 
            dict.js_preload_success_desc.replace('${amount}', data.received_USDc.toFixed(2)),
            `
            <strong>${dict.details_host_tx || 'Transacción Host'}:</strong> ${data.tx_id}<br>
            <strong>${dict.details_crypto_network || 'Red Cripto'}:</strong> Polygon (USDc)<br>
            <strong>${dict.details_amount_charged || 'Monto Cobrado'}:</strong> $${selectedPreloadAmount.toFixed(2)} USD<br>
            <strong>${dict.details_preload_fee || 'Comisión de Carga (1%)'}:</strong> $${(selectedPreloadAmount * 0.01).toFixed(2)} USD<br>
            <strong>${dict.details_amount_credited || 'Monto Acreditado'}:</strong> $${data.received_USDc.toFixed(2)} USDc<br>
            <strong>${dict.details_available_balance || 'Saldo Disponible'}:</strong> $${state.balance.toFixed(2)} USDc
            `
          );
        } else {
          const errData = await res.json();
          alert("Error: " + (errData.message || "Preload failed."));
          switchScreen('screen-dashboard');
        }
      } catch (err) {
        console.warn("Backend Go desconectado. Realizando carga simulada local.");
        const fee = selectedPreloadAmount * 0.01;
        const netReceived = selectedPreloadAmount - fee;
        state.balance += netReceived;
        state.transactions.unshift({
          id: "tx_" + Date.now(),
          merchant: "Pre-carga Tarjeta",
          fiat: selectedPreloadAmount.toFixed(2),
          fiat_symbol: "$",
          USDc: netReceived.toFixed(2),
          type: "load",
          date: "Hoy",
          status: "Completado"
        });
        
        showSuccessScreen(
          dict.js_preload_success_title_local, 
          dict.js_preload_success_desc_local.replace('${amount}', netReceived.toFixed(2)),
          `
          <strong>${dict.details_host_tx || 'Transacción Host'}:</strong> tr_mock_${Math.random().toString(36).substr(2, 9)}<br>
          <strong>${dict.details_crypto_network || 'Red Cripto'}:</strong> Polygon (USDc)<br>
          <strong>${dict.details_amount_charged || 'Monto Cobrado'}:</strong> $${selectedPreloadAmount.toFixed(2)} USD<br>
          <strong>${dict.details_preload_fee || 'Comisión de Carga (1%)'}:</strong> $${fee.toFixed(2)} USD<br>
          <strong>${dict.details_amount_credited || 'Monto Acreditado'}:</strong> $${netReceived.toFixed(2)} USDc<br>
          <strong>${dict.details_available_balance || 'Saldo Disponible'}:</strong> $${state.balance.toFixed(2)} USDc
          `
        );
        updateBalanceUI();
        renderTransactions();
      }
    });
  });
  
  btnBankCancel.addEventListener('click', () => {
    document.getElementById('bank-modal-overlay').classList.remove('active');
  });
}

// --- FLUJO 3: DASHBOARD & COUNTRY TOGGLE ---
function initDashboard() {
  const locToggle = document.getElementById('location-toggle');
  const btnScan = document.getElementById('btn-action-scan');
  const btnTransfer = document.getElementById('btn-action-transfer');
  
  locToggle.addEventListener('click', () => {
    const dict = translations[state.lang] || translations['es'];
    if (state.country === 'ars') {
      state.country = 'brl';
      document.getElementById('flag-icon').innerText = '🇧🇷';
      document.getElementById('location-name').innerText = 'Río de Janeiro, BR';
      document.getElementById('transfer-btn-text').innerText = dict.btn_transfer_brl || 'Enviar por Pix';
    } else {
      state.country = 'ars';
      document.getElementById('flag-icon').innerText = '🇦🇷';
      document.getElementById('location-name').innerText = 'Buenos Aires, AR';
      document.getElementById('transfer-btn-text').innerText = dict.btn_transfer_ars || 'Enviar CBU/Alias';
    }
    updateBalanceUI();
    renderTransactions();
  });
  
  btnScan.addEventListener('click', () => {
    switchScreen('screen-scan');
    document.getElementById('scan-view').style.display = 'block';
    document.getElementById('checkout-view').style.display = 'none';
    resetSlider();
  });
  
  btnTransfer.addEventListener('click', () => {
    btnScan.click();
  });
}

function updateBalanceUI() {
  const rate = fxRates[state.country];
  const fiatEquivalent = state.balance * rate;
  
  document.getElementById('balance-USDc').innerHTML = `$${state.balance.toFixed(2)} <span style="font-size: 1.1rem; color: var(--ios-gray-text);">USDc</span>`;
  
  if (state.country === 'ars') {
    document.getElementById('balance-fiat-eq').innerText = `≈ $${fiatEquivalent.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ARS`;
  } else {
    document.getElementById('balance-fiat-eq').innerText = `≈ R$${fiatEquivalent.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} BRL`;
  }
}

// Historial de Transacciones (Muted B&W iOS layout)
function renderTransactions() {
  const list = document.getElementById('tx-list');
  list.innerHTML = '';
  
  state.transactions.forEach(tx => {
    const item = document.createElement('div');
    item.className = 'tx-cell'; // Cambiado de tx-item a tx-cell
    
    let icon = '<i class="fa-solid fa-arrow-down-long" style="color: var(--ios-white);"></i>';
    let sign = '+';
    let color = 'var(--ios-white)';
    
    if (tx.type === 'pay') {
      icon = '<i class="fa-solid fa-cart-shopping" style="color: var(--ios-gray-light);"></i>';
      sign = '-';
      color = 'var(--text-main)';
    } else if (tx.type === 'refund') {
      icon = '<i class="fa-solid fa-arrow-rotate-left" style="color: var(--text-muted);"></i>';
      sign = '-';
      color = 'var(--text-muted)';
    }
    
    const usdcValue = tx.usdc !== undefined ? tx.usdc : tx.USDc;
    item.innerHTML = `
      <div class="tx-info">
        <div class="tx-icon">${icon}</div>
        <div>
          <div class="tx-title">${translateDynamicText(tx.merchant)}</div>
          <div class="tx-date">${translateDynamicText(tx.date)}</div>
        </div>
      </div>
      <div class="tx-amount">
        <div class="tx-amount-val" style="color: ${color}">${sign}$${parseFloat(usdcValue).toFixed(2)} USDc</div>
        <div class="tx-status">${translateDynamicText(tx.status)}</div>
      </div>
    `;
    list.appendChild(item);
  });
}

// --- FLUJO 4: CHECKOUT & SLIDE TO PAY ---
let currentCheckoutData = null;

function initCheckout() {
  const qrCards = document.querySelectorAll('.qr-demo-card');
  const btnCloseCheckout = document.getElementById('btn-close-checkout');
  
  qrCards.forEach(card => {
    card.addEventListener('click', () => {
      const country = card.getAttribute('data-country');
      const amount = parseFloat(card.getAttribute('data-amount'));
      const merchant = card.getAttribute('data-merchant');
      
      // Ocultar escáner y mostrar pantalla de decodificación
      document.getElementById('scan-view').style.display = 'none';
      const resolvingView = document.getElementById('resolving-view');
      resolvingView.style.display = 'block';
      
      const dict = translations[state.lang] || translations['es'];
      document.getElementById('resolving-title').innerText = dict.js_resolving_qr;
      document.getElementById('resolving-subtitle').innerText = country === 'ars' ? dict.js_resolving_qr_mp : dict.js_resolving_qr_pix;
      
      setTimeout(() => {
        resolvingView.style.display = 'none';
        openCheckout(country, amount, merchant);
      }, 1200);
    });
  });
  
  btnCloseCheckout.addEventListener('click', () => {
    switchScreen('screen-dashboard');
  });
  
  initSlider();
}

function openCheckout(country, amount, merchant) {
  document.getElementById('scan-view').style.display = 'none';
  document.getElementById('checkout-view').style.display = 'block';
  
  const rate = fxRates[country];
  const rawUSDc = amount / rate;
  
  // Estrategia híbrida china: 0% en micropagos <= $15 USDc, 3% en consumos mayores
  const isMicropayment = rawUSDc <= 15.0;
  const serviceFee = isMicropayment ? 0.0 : rawUSDc * 0.03;
  const gasFee = 0.10;
  const totalUSDc = rawUSDc + serviceFee + gasFee;
  
  currentCheckoutData = {
    country,
    amount,
    merchant,
    totalUSDc,
    rate
  };
  
  const dict = translations[state.lang] || translations['es'];
  const effectiveRate = amount / totalUSDc;
  const fiatSymbol = country === 'ars' ? '$' : 'R$';
  const currencyLabel = country.toUpperCase();

  document.getElementById('checkout-merchant').innerText = dict.checkout_merchant.replace('{merchant}', merchant);
  document.getElementById('checkout-fiat-amount').innerText = country === 'ars' ? `$${amount.toLocaleString('es-AR')} ARS` : `R$${amount.toLocaleString('pt-BR')} BRL`;
  document.getElementById('checkout-fx-rate').innerText = `${fiatSymbol}${effectiveRate.toFixed(2)} ${currencyLabel} = 1 USDc`;
  document.getElementById('checkout-total-usd').innerText = `$${totalUSDc.toFixed(2)} USDc`;
  
  // Calcular e inyectar ahorro cambiario real
  const savingsPercent = country === 'ars' ? 0.065 : 0.05;
  const savingsUSD = totalUSDc * savingsPercent;
  const savingsBox = document.getElementById('checkout-savings-indicator-box');
  const savingsDesc = document.getElementById('checkout-savings-desc-text');
  
  // Mostrar u ocultar filas de comisión y red en la UI
  const feeRow = document.getElementById('checkout-fee').closest('.detail-row');
  if (feeRow) {
    feeRow.style.display = 'flex';
    document.getElementById('checkout-fee').innerText = isMicropayment 
      ? (state.lang === 'es' ? '$0.00 USDc (Subvencionado)' : '$0.00 USDc (Subsidized)') 
      : `$${serviceFee.toFixed(2)} USDc`;
  }
  const gasRow = document.getElementById('checkout-gas').closest('.detail-row');
  if (gasRow) {
    gasRow.style.display = 'flex';
    document.getElementById('checkout-gas').innerText = `$${gasFee.toFixed(2)} USDc`;
  }
  
  document.getElementById('checkout-title').innerText = country === 'ars' ? 'Pago QR (Mercado Pago / MODO)' : 'Pago QR (Pix)';
  
  // Establecer datos resueltos del riel local
  document.getElementById('checkout-origin-network').innerText = country === 'ars' ? 'Mercado Pago / MODO QR' : 'Pix (Banco Central)';
  document.getElementById('checkout-destination-detail').innerText = country === 'ars' ? 'CVU 0000003100012345678901' : 'Chave Pix CNPJ 12.345.678/0001-90';

  const slideText = document.getElementById('slide-text');
  const sliderContainer = document.getElementById('slide-to-pay-container');
  
  // Validación de límites KYC
  const isKycLimitExceeded = (state.kycTier === 1 && totalUSDc > 20.0);
  
  if (state.balance < totalUSDc) {
    slideText.innerText = dict.slide_to_pay_insufficient;
    slideText.style.color = 'var(--error-color)';
    sliderContainer.style.borderColor = 'var(--error-color)';
    document.getElementById('slide-handle').style.pointerEvents = 'none';
  } else if (isKycLimitExceeded) {
    slideText.innerText = state.lang === 'es' ? 'Excede Límite Express ($20)' : 'Exceeds Express Limit ($20)';
    slideText.style.color = 'var(--error-color)';
    sliderContainer.style.borderColor = 'var(--error-color)';
    document.getElementById('slide-handle').style.pointerEvents = 'none';
    
    // Mostrar aviso en rojo de que debe subir de nivel en lugar del banner verde de ahorro
    if (savingsBox && savingsDesc) {
      savingsBox.style.background = 'rgba(255, 69, 58, 0.1)';
      savingsBox.style.borderColor = 'rgba(255, 69, 58, 0.25)';
      const icon = savingsBox.querySelector('.savings-icon');
      if (icon) {
        icon.style.color = 'var(--error-color)';
        icon.style.background = 'rgba(255, 69, 58, 0.2)';
        icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
      }
      const title = savingsBox.querySelector('.savings-text-wrapper div');
      if (title) title.innerText = state.lang === 'es' ? '¡Límite de Cuenta Excedido!' : 'Account Limit Exceeded!';
      
      savingsDesc.innerHTML = state.lang === 'es' 
        ? 'Tu cuenta de <strong>Acceso Express (Tier 1)</strong> tiene un límite de $20 USDc por pago. Sube de nivel en el menú Perfil para desbloquear compras ilimitadas.'
        : 'Your <strong>Express Access (Tier 1)</strong> account has a limit of $20 USDc per payment. Upgrade in the Profile menu to unlock unlimited purchases.';
    }
  } else {
    // Restaurar estilo verde de ahorro cambiario si estaba en rojo
    if (savingsBox && savingsDesc) {
      savingsBox.style.background = 'rgba(48, 209, 88, 0.1)';
      savingsBox.style.borderColor = 'rgba(48, 209, 88, 0.25)';
      const icon = savingsBox.querySelector('.savings-icon');
      if (icon) {
        icon.style.color = 'var(--success-color)';
        icon.style.background = 'rgba(48, 209, 88, 0.2)';
        icon.innerHTML = '<i class="fa-solid fa-piggy-bank"></i>';
      }
      const title = savingsBox.querySelector('.savings-text-wrapper div');
      if (title) title.innerText = state.lang === 'es' ? '¡Ahorro Cambiario!' : 'Exchange Savings!';
      
      if (isMicropayment) {
        savingsDesc.innerHTML = state.lang === 'es'
          ? `<strong>¡Micropago Subvencionado!</strong> Spree exime la comisión del 3% en consumos menores a $15 USD, ahorrando además un 5-6% de tipo de cambio.`
          : `<strong>Subsidized Micropayment!</strong> Spree waives the 3% service fee on transactions under $15 USD, saving an extra 5-6% on exchange rates.`;
      } else {
        if (state.lang === 'es') {
          savingsDesc.innerHTML = `Obtienes un tipo de cambio paralelo, <strong>ahorrando $${savingsUSD.toFixed(2)} USDc</strong> frente a comisiones y recargos de tarjetas tradicionales.`;
        } else if (state.lang === 'en') {
          savingsDesc.innerHTML = `You get a parallel exchange rate, <strong>saving $${savingsUSD.toFixed(2)} USDc</strong> compared to traditional card fees and markups.`;
        } else {
          savingsDesc.innerHTML = `${dict.checkout_savings_desc.replace('{amount}', savingsUSD.toFixed(2))}`;
        }
      }
    }
    
    slideText.innerText = dict.slide_to_pay;
    slideText.style.color = 'var(--text-muted)';
    sliderContainer.style.borderColor = 'var(--card-border)';
    document.getElementById('slide-handle').style.pointerEvents = 'auto';
  }
}

// Slider
let isDragging = false;
let startX = 0;
let maxDrag = 0;

function initSlider() {
  const handle = document.getElementById('slide-handle');
  const container = document.getElementById('slide-to-pay-container');
  const fill = document.getElementById('slide-fill');
  
  handle.addEventListener('mousedown', dragStart);
  window.addEventListener('mousemove', dragMove);
  window.addEventListener('mouseup', dragEnd);
  
  handle.addEventListener('touchstart', dragStart, {passive: true});
  window.addEventListener('touchmove', dragMove, {passive: false});
  window.addEventListener('touchend', dragEnd);
  
  function dragStart(e) {
    if (state.balance < currentCheckoutData.totalUSDc) return;
    isDragging = true;
    startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    maxDrag = container.clientWidth - handle.clientWidth - 6;
    handle.style.cursor = 'grabbing';
  }
  
  function dragMove(e) {
    if (!isDragging) return;
    if (e.type === 'touchmove') e.preventDefault();
    
    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    let deltaX = clientX - startX;
    
    if (deltaX < 0) deltaX = 0;
    if (deltaX > maxDrag) deltaX = maxDrag;
    
    handle.style.left = (deltaX + 3) + 'px';
    fill.style.width = (deltaX + handle.clientWidth / 2) + 'px';
    
    const opacity = 1 - (deltaX / maxDrag);
    document.getElementById('slide-text').style.opacity = opacity;
  }
  
  function dragEnd() {
    if (!isDragging) return;
    isDragging = false;
    handle.style.cursor = 'grab';
    
    const currentLeft = parseInt(handle.style.left) || 3;
    
    if (currentLeft >= maxDrag - 5) {
      handle.style.left = (maxDrag + 3) + 'px';
      executePayment();
    } else {
      resetSlider();
    }
  }
}

function resetSlider() {
  const handle = document.getElementById('slide-handle');
  const fill = document.getElementById('slide-fill');
  handle.style.left = '3px';
  fill.style.width = '0px';
  document.getElementById('slide-text').style.opacity = 1;
}

function executePayment() {
  if (!currentCheckoutData) return;
  
  switchScreen('screen-processing');
  
  const procTitle = document.getElementById('proc-loading-title');
  const procText = document.getElementById('proc-loading-text');
  
  const dict = translations[state.lang] || translations['es'];
  
  // Fase 1: Debitando balance USDc en Polygon
  procTitle.innerText = dict.js_debiting_balance;
  procText.innerText = dict.js_debiting_desc.replace('${amount}', currentCheckoutData.totalUSDc.toFixed(2));
  
  setTimeout(() => {
    // Fase 2: Enviando fondos al riel local mediante Bitso API
    const rielName = currentCheckoutData.country === 'ars' ? 'Mercado Pago / MODO' : 'Pix (Brasil)';
    procTitle.innerText = dict.js_sending_funds_riel.replace('{riel}', rielName);
    procText.innerText = dict.js_riel_liquidation;
    
    setTimeout(() => {
      // Fase 3: Confirmación asíncrona de liquidación del banco/Mercado Pago
      procTitle.innerText = dict.js_verifying;
      procText.innerText = currentCheckoutData.country === 'ars' 
        ? "Esperando confirmación de red de Mercado Pago / COELSA..." 
        : "Esperando confirmación final del riel Pix (Banco Central de Brasil)...";
      
      setTimeout(async () => {
        try {
          const res = await fetchWithAuth(`${API_BASE}/api/wallet/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merchant: currentCheckoutData.merchant,
              amount: currentCheckoutData.amount,
              country: currentCheckoutData.country
            })
          });
          if (res.ok) {
            const data = await res.json();
            state.balance = data.balance;
            await syncStateWithBackend();
            
            const rielTxLabel = currentCheckoutData.country === 'ars' ? dict.riel_cbu_cvu : dict.riel_pix;
            const rielIdMock = currentCheckoutData.country === 'ars' ? '0000003100012345678901' : 'pix.recepcion.comercio@email.com';
            
            showSuccessScreen(
              dict.js_payment_success_title,
              dict.js_payment_success_desc,
              `
              <strong>${dict.details_recipient}:</strong> ${currentCheckoutData.merchant}<br>
              <strong>${rielTxLabel}:</strong> ${rielIdMock}<br>
              <strong>${dict.details_amount_paid}:</strong> ${data.fiat_paid} ${currentCheckoutData.country.toUpperCase()}<br>
              <strong>${dict.details_usdc_debited}:</strong> $${data.USDc_spent.toFixed(2)} USDc<br>
              <strong>${dict.details_crypto_network}:</strong> Polygon (USDc)
              `
            );
          } else {
            const data = await res.json();
            alert(data.message || "Error");
            switchScreen('screen-dashboard');
          }
        } catch (err) {
          console.warn("Backend Go desconectado. Procesando pago localmente en simulación.");
          state.balance -= currentCheckoutData.totalUSDc;
          
          const newTx = {
            id: "tx_" + Date.now(),
            merchant: currentCheckoutData.merchant,
            fiat: currentCheckoutData.amount.toFixed(2),
            fiat_symbol: currentCheckoutData.country === 'ars' ? '$' : 'R$',
            USDc: currentCheckoutData.totalUSDc.toFixed(2),
            type: "pay",
            date: "Hoy",
            status: "Completado"
          };
          state.transactions.unshift(newTx);
          
          const rielTxLabel = currentCheckoutData.country === 'ars' ? dict.riel_cbu_cvu : dict.riel_pix;
          const rielIdMock = currentCheckoutData.country === 'ars' ? '0000003100012345678901' : 'pix.recepcion.comercio@email.com';
          
          showSuccessScreen(
            dict.js_payment_success_title_local,
            dict.js_payment_success_desc_local,
            `
            <strong>${dict.details_recipient}:</strong> ${currentCheckoutData.merchant}<br>
            <strong>${rielTxLabel}:</strong> ${rielIdMock}<br>
            <strong>${dict.details_amount_paid}:</strong> ${newTx.fiat_symbol}${currentCheckoutData.amount.toLocaleString()} ${currentCheckoutData.country.toUpperCase()}<br>
            <strong>${dict.details_usdc_debited}:</strong> $${currentCheckoutData.totalUSDc.toFixed(2)} USDc<br>
            <strong>${dict.details_crypto_network}:</strong> Polygon (USDc)
            `
          );
          updateBalanceUI();
          renderTransactions();
        } finally {
          currentCheckoutData = null;
        }
      }, 1000); // Espera 1s en la fase final de confirmación
    }, 1000); // Espera 1s en la fase 2
  }, 900); // Espera 900ms en la fase 1
}

// --- FLUJO 5: REFUND / DEVOLUCIÓN A TARJETA ---
function initRefund() {
  const btnRefundExecute = document.getElementById('btn-refund-execute');
  
  btnRefundExecute.addEventListener('click', () => {
    if (state.balance <= 0) return;
    
    const refundAmount = state.balance;
    const fee = refundAmount * 0.015;
    const netReceived = refundAmount - fee;
    
    switchScreen('screen-processing');
    
    const dict = translations[state.lang] || translations['es'];
    
    triggerProcessingScreen(
      dict.js_refunding_funds, 
      dict.js_refunding_desc, 
      async () => {
        try {
          const res = await fetchWithAuth(`${API_BASE}/api/wallet/refund`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: refundAmount })
          });
          if (res.ok) {
            const data = await res.json();
            state.balance = data.balance;
            await syncStateWithBackend();
            
            showSuccessScreen(
              dict.js_refund_success_title,
              dict.js_refund_success_desc,
              `
              <strong>${dict.details_destination_method}:</strong> Visa •••• 4321<br>
              <strong>${dict.details_withdrawn_amount}:</strong> $${data.refunded_USDc.toFixed(2)} USDc<br>
              <strong>${dict.details_refund_fee}:</strong> $${data.fee_USDc.toFixed(2)} USDc<br>
              <strong>${dict.details_final_credit}:</strong> $${data.net_received_usd.toFixed(2)} USD<br>
              <span style="font-size:0.75rem; color: var(--text-muted);">${dict.js_refund_warning}</span>
              `
            );
          } else {
            const data = await res.json();
            alert(data.message || "Error");
            switchScreen('screen-dashboard');
          }
        } catch (err) {
          console.warn("Backend Go desconectado. Procesando reembolso localmente en simulación.");
          state.balance = 0.00;
          
          state.transactions.unshift({
            id: "tx_" + Date.now(),
            merchant: "Reembolso Tarjeta",
            fiat: netReceived.toFixed(2),
            fiat_symbol: "$",
            USDc: refundAmount.toFixed(2),
            type: "refund",
            date: "Hoy",
            status: "Completado"
          });
          
          showSuccessScreen(
            dict.js_refund_success_title_local,
            dict.js_refund_success_desc_local,
            `
            <strong>${dict.details_destination_method}:</strong> Visa •••• 4321<br>
            <strong>${dict.details_withdrawn_amount}:</strong> $${refundAmount.toFixed(2)} USDc<br>
            <strong>${dict.details_refund_fee}:</strong> $${fee.toFixed(2)} USDc<br>
            <strong>${dict.details_final_credit}:</strong> $${netReceived.toFixed(2)} USD<br>
            <span style="font-size:0.75rem; color: var(--text-muted);">${dict.js_refund_warning}</span>
            `
          );
          updateBalanceUI();
          renderTransactions();
        }
      }
    );
  });
}

let selectedMarketItem = null;

// Catálogo de Servicios Turísticos (Conectividad, Seguros y Civitatis)
const marketItems = [
  {
    id: "esim_regional",
    category: "connectivity",
    titleKey: "market_item_esim_title",
    descKey: "market_item_esim_desc",
    icon: "fa-wifi",
    price: 15.00
  },
  {
    id: "insurance_premium",
    category: "insurance",
    titleKey: "market_item_insurance_title",
    descKey: "market_item_insurance_desc",
    icon: "fa-shield-heart",
    price: 25.00,
    isInsurance: true
  },
  {
    id: "civitatis_bot_assistant",
    category: "tours",
    titleKey: "market_item_civitatis_bot_title",
    descKey: "market_item_civitatis_bot_desc",
    icon: "fa-robot",
    price: 0,
    isCivitatisBot: true
  },
  {
    id: "car_rental_local",
    category: "cars",
    titleKey: "market_item_car_title",
    descKey: "market_item_car_desc",
    icon: "fa-car",
    price: 35.00,
    isCarRental: true
  }
];

function initMarketplace() {
  const categories = document.querySelectorAll('.category-tab');
  
  categories.forEach(cat => {
    cat.addEventListener('click', () => {
      categories.forEach(c => c.classList.remove('active'));
      cat.classList.add('active');
      
      const filter = cat.getAttribute('data-category');
      
      // Mostrar/ocultar filtros de Civitatis
      const civFilters = document.getElementById('civitatis-filters-wrapper');
      if (civFilters) {
        civFilters.style.display = 'none';
      }
      
      renderMarketItems(filter, getToursSearchQuery(), getToursCityFilter());
    });
  });
  
  // Buscar en Civitatis
  const searchInput = document.getElementById('market-tours-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const activeTab = document.querySelector('.category-tab.active');
      const filter = activeTab ? activeTab.getAttribute('data-category') : 'all';
      renderMarketItems(filter, getToursSearchQuery(), getToursCityFilter());
    });
  }
  
  // Filtros de ciudad para Civitatis
  const cityBtns = document.querySelectorAll('#civitatis-city-filters .city-pill');
  cityBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      cityBtns.forEach(b => {
        b.classList.remove('active');
        b.style.background = 'rgba(255,255,255,0.03)';
        b.style.color = 'var(--text-muted)';
        b.classList.remove('active');
      });
      btn.classList.add('active');
      btn.style.background = 'var(--ios-white)';
      btn.style.color = '#000';
      
      const activeTab = document.querySelector('.category-tab.active');
      const filter = activeTab ? activeTab.getAttribute('data-category') : 'all';
      renderMarketItems(filter, getToursSearchQuery(), getToursCityFilter());
    });
  });
  
  // Modal de compra
  const btnPurchaseConfirm = document.getElementById('btn-purchase-confirm');
  const btnPurchaseCancel = document.getElementById('btn-purchase-cancel');
  
  if (btnPurchaseConfirm) {
    btnPurchaseConfirm.replaceWith(btnPurchaseConfirm.cloneNode(true));
    document.getElementById('btn-purchase-confirm').addEventListener('click', () => {
      if (!selectedMarketItem) return;
      document.getElementById('purchase-modal-overlay').classList.remove('active');
      
      let finalName = selectedMarketItem.name;
      if (selectedMarketItem.selectedTravelers && selectedMarketItem.selectedTravelers.length > 0) {
        finalName += ` (${selectedMarketItem.selectedTravelers.join(', ')})`;
      }
      
      executeMarketPurchase(finalName, selectedMarketItem.price, selectedMarketItem.isCivitatis);
    });
  }
  
  if (btnPurchaseCancel) {
    btnPurchaseCancel.replaceWith(btnPurchaseCancel.cloneNode(true));
    document.getElementById('btn-purchase-cancel').addEventListener('click', () => {
      document.getElementById('purchase-modal-overlay').classList.remove('active');
      selectedMarketItem = null;
    });
  }
  
  // Modal de seguros
  const btnCloseInsurance = document.getElementById('btn-close-insurance');
  if (btnCloseInsurance) {
    btnCloseInsurance.addEventListener('click', closeInsuranceModal);
  }
  
  const insuranceDaysInput = document.getElementById('insurance-days');
  if (insuranceDaysInput) {
    insuranceDaysInput.addEventListener('input', updateInsurancePrice);
  }
  
  const btnInsuranceQuoteBuy = document.getElementById('btn-insurance-quote-buy');
  if (btnInsuranceQuoteBuy) {
    btnInsuranceQuoteBuy.addEventListener('click', () => {
      // Gather selected travelers from insurance list
      const container = document.getElementById('insurance-travelers-list');
      if (!container) return;
      const chks = container.querySelectorAll('.insurance-traveler-chk:checked');
      if (chks.length === 0) return;
      
      const selectedNames = [];
      let totalDailyCost = 0;
      chks.forEach(chk => {
        const type = chk.getAttribute('data-type');
        let name = '';
        let age = 30;
        if (type === 'main') {
          name = state.profile.name || 'Tú';
          age = state.profile.age || 30;
        } else {
          const idx = parseInt(chk.getAttribute('data-index'));
          if (state.companions[idx]) {
            name = state.companions[idx].name;
            age = state.companions[idx].age || 30;
          }
        }
        selectedNames.push(name);
        let rate = 3.00;
        if (age > 60) rate = 4.50;
        totalDailyCost += rate;
      });

      const days = parseInt(document.getElementById('insurance-days').value) || 10;
      const country = document.getElementById('insurance-country').value || 'Global';
      const totalCost = days * totalDailyCost;
      
      const dict = translations[state.lang] || translations['es'];
      
      if (state.balance < totalCost) {
        alert(dict.slide_to_pay_insufficient || "Saldo Insuficiente");
        return;
      }
      
      closeInsuranceModal();
      
      const name = `${dict.market_item_insurance_title || "Seguro de Viaje Premium"} (${days} días - ${country}) (${selectedNames.join(', ')})`;
      
      executeMarketPurchase(name, totalCost, false);
    });
  }
  
  // Modal de alquiler de autos
  const btnCloseCarRental = document.getElementById('btn-close-car-rental');
  if (btnCloseCarRental) {
    btnCloseCarRental.addEventListener('click', closeCarRentalModal);
  }

  const carTypeSelect = document.getElementById('car-type');
  if (carTypeSelect) {
    carTypeSelect.addEventListener('change', updateCarRentalPrice);
  }

  const carDaysInput = document.getElementById('car-days');
  if (carDaysInput) {
    carDaysInput.addEventListener('input', updateCarRentalPrice);
  }

  const carInsuranceOpt = document.getElementById('car-insurance-opt');
  if (carInsuranceOpt) {
    carInsuranceOpt.addEventListener('change', updateCarRentalPrice);
  }

  const btnCarRentalBuy = document.getElementById('btn-car-rental-buy');
  if (btnCarRentalBuy) {
    btnCarRentalBuy.addEventListener('click', () => {
      const driverSelect = document.getElementById('car-driver');
      const driverName = driverSelect ? driverSelect.value : (state.profile.name || 'Tú');
      
      const typeSelect = document.getElementById('car-type');
      const selectedOpt = typeSelect ? typeSelect.options[typeSelect.selectedIndex] : null;
      const baseRate = selectedOpt ? parseFloat(selectedOpt.getAttribute('data-price')) : 35;
      const carTypeName = selectedOpt ? selectedOpt.text.split('(')[0].trim() : 'Compacto';
      
      const days = parseInt(document.getElementById('car-days').value) || 5;
      const hasInsurance = document.getElementById('car-insurance-opt')?.checked || false;
      const dailyRate = baseRate + (hasInsurance ? 10.00 : 0.00);
      const totalCost = dailyRate * days;
      
      const dict = translations[state.lang] || translations['es'];
      
      if (state.balance < totalCost) {
        alert(dict.slide_to_pay_insufficient || "Saldo Insuficiente");
        return;
      }
      
      closeCarRentalModal();
      
      const name = `${dict.market_item_car_title || "Alquiler de Vehículos"} (${carTypeName} - ${days} días) (Chofer: ${driverName})`;
      
      executeMarketPurchase(name, totalCost, false);
    });
  }
  
  // Render inicial
  renderMarketItems('all', '', 'all');
}

function getToursSearchQuery() {
  const input = document.getElementById('market-tours-search');
  return input ? input.value : '';
}

function getToursCityFilter() {
  const activeCity = document.querySelector('#civitatis-city-filters .city-pill.active');
  return activeCity ? activeCity.getAttribute('data-city') : 'all';
}

function renderMarketItems(filterCategory = 'all', searchQuery = '', filterCity = 'all') {
  const container = document.getElementById('market-items-container');
  if (!container) return;
  container.innerHTML = '';
  
  const dict = translations[state.lang] || translations['es'];
  const esimClaimed = localStorage.getItem('spree_esim_claimed') === 'true';
  
  const filtered = marketItems.filter(item => {
    // 1. Filtrar por categoría
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    
    // Si estamos en tours y el ítem es de tours, filtrar por ciudad también
    if (item.category === 'tours' && filterCity !== 'all' && item.city !== filterCity) return false;
    
    // 2. Filtrar por búsqueda
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const title = (item.title || dict[item.titleKey] || '').toLowerCase();
      const desc = (item.desc || dict[item.descKey] || '').toLowerCase();
      if (!title.includes(q) && !desc.includes(q)) return false;
    }
    
    return true;
  });
  
  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'market-item-card';
    card.setAttribute('data-cat', item.category);
    if (item.city) card.setAttribute('data-city', item.city);
    
    const title = item.title || dict[item.titleKey] || item.id;
    const desc = item.desc || dict[item.descKey] || '';
    
    let priceText = '';
    let buyBtnText = dict.btn_buy || 'Comprar';
    let itemPrice = item.price;
    
    let esimBadgeHtml = '';
    let partnerBadgeHtml = '';
    
    if (item.id === 'esim_regional') {
      if (!esimClaimed) {
        priceText = 'Gratis';
        buyBtnText = dict.btn_request_free || 'Obtener (Gratis)';
        itemPrice = 0;
      } else {
        priceText = `$${item.price.toFixed(2)} USDc`;
        esimBadgeHtml = `<span class="esim-status-badge">${dict.esim_claimed_badge || 'Reclamada'}</span>`;
      }
    } else if (item.isCivitatisBot) {
      priceText = 'Gratis';
      buyBtnText = dict.btn_start_assistant || 'Iniciar Chat';
      itemPrice = 0;
    } else {
      priceText = `$${item.price.toFixed(2)} USDc`;
    }
    
    if (item.isCivitatis || item.isCivitatisBot) {
      partnerBadgeHtml = `<span class="market-partner-badge">${dict.market_tours_partner_badge || 'Socio Civitatis'}</span>`;
    }
    
    card.innerHTML = `
      <div class="market-item-info">
        <div class="market-item-icon"><i class="fa-solid ${item.icon}"></i></div>
        <div style="flex: 1;">
          <div class="market-item-title">${title}</div>
          <div class="market-item-desc">${desc}</div>
          <div style="margin-top: 2px;">${esimBadgeHtml} ${partnerBadgeHtml}</div>
        </div>
      </div>
      <div class="market-item-buy">
        <div class="market-item-price">${priceText}</div>
        <button class="btn-buy-small" data-id="${item.id}" data-name="${title}" data-price="${itemPrice}">${buyBtnText}</button>
      </div>
    `;
    
    container.appendChild(card);
    
    // Bind click event
    const btn = card.querySelector('.btn-buy-small');
    btn.addEventListener('click', () => {
      if (item.isInsurance) {
        openInsuranceModal();
      } else if (item.isCarRental) {
        openCarRentalModal();
      } else if (item.isCivitatisBot) {
        startCivitatisBotChat();
      } else {
        openPurchaseModal(title, itemPrice, item.isCivitatis);
      }
    });
  });
}

function startCivitatisBotChat() {
  switchScreen('screen-support');
  const tabChatBtn = document.getElementById('btn-tab-chat');
  const tabTicketBtn = document.getElementById('btn-tab-ticket');
  const chatView = document.getElementById('support-chat-view');
  const ticketView = document.getElementById('support-ticket-view');
  if (tabChatBtn && tabTicketBtn) {
    tabChatBtn.classList.add('active');
    tabTicketBtn.classList.remove('active');
    chatView.style.display = 'flex';
    ticketView.style.display = 'none';
  }
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(i => i.classList.remove('active'));
  const supportNavItem = document.querySelector('.nav-item[data-screen="screen-support"]');
  if (supportNavItem) {
    supportNavItem.classList.add('active');
  }
  
  if (window.initChatbotWelcome) {
    window.initChatbotWelcome();
  }
  
  const chatInput = document.getElementById('chat-message-input');
  if (chatInput) {
    chatInput.value = "Quiero reservar una excursión de Civitatis";
    handleChatSubmit();
  }
}

function closeInsuranceModal() {
  const modal = document.getElementById('insurance-modal-overlay');
  if (modal) modal.classList.remove('active');
}

function openInsuranceModal() {
  const modal = document.getElementById('insurance-modal-overlay');
  if (modal) modal.classList.add('active');

  const container = document.getElementById('insurance-travelers-list');
  if (container) {
    container.innerHTML = '';
    
    // Add Main Traveler checkbox
    const mainLabel = document.createElement('label');
    mainLabel.style.display = 'flex';
    mainLabel.style.alignItems = 'center';
    mainLabel.style.gap = '8px';
    mainLabel.style.fontSize = '0.75rem';
    mainLabel.style.color = '#FFF';
    mainLabel.style.cursor = 'pointer';
    mainLabel.innerHTML = `
      <input type="checkbox" class="insurance-traveler-chk" data-type="main" checked style="width: 14px; height: 14px; cursor: pointer;">
      <span>${state.profile.name || 'Tú'} (${state.lang === 'en' ? 'You' : 'Tú'} - ${state.profile.age || 30} ${state.lang === 'en' ? 'yrs' : 'años'})</span>
    `;
    container.appendChild(mainLabel);

    // Add Companions checkboxes
    state.companions.forEach((c, index) => {
      const compLabel = document.createElement('label');
      compLabel.style.display = 'flex';
      compLabel.style.alignItems = 'center';
      compLabel.style.gap = '8px';
      compLabel.style.fontSize = '0.75rem';
      compLabel.style.color = '#FFF';
      compLabel.style.cursor = 'pointer';
      compLabel.innerHTML = `
        <input type="checkbox" class="insurance-traveler-chk" data-type="companion" data-index="${index}" style="width: 14px; height: 14px; cursor: pointer;">
        <span>${c.name} (${c.relationship === 'Familiar' ? (state.lang === 'en' ? 'Family' : 'Familiar') : (state.lang === 'en' ? 'Friend' : 'Amigo/a')} - ${c.age || 30} ${state.lang === 'en' ? 'yrs' : 'años'})</span>
      `;
      container.appendChild(compLabel);
    });

    // Handle updates when checkbox selection changes
    const chks = container.querySelectorAll('.insurance-traveler-chk');
    chks.forEach(chk => {
      chk.addEventListener('change', () => {
        updateInsurancePrice();
      });
    });
  }

  updateInsurancePrice();
}

function updateInsurancePrice() {
  const daysInput = document.getElementById('insurance-days');
  const totalCostSpan = document.getElementById('insurance-total-cost');
  const dailyCostSpan = document.getElementById('insurance-daily-cost');
  const btnBuy = document.getElementById('btn-insurance-quote-buy');
  
  if (!daysInput || !totalCostSpan) return;
  
  let days = parseInt(daysInput.value) || 0;
  if (days < 1) days = 1;
  if (days > 90) days = 90;
  daysInput.value = days;

  const container = document.getElementById('insurance-travelers-list');
  if (!container) return;

  const chks = container.querySelectorAll('.insurance-traveler-chk:checked');
  const count = chks.length;

  if (count === 0) {
    if (dailyCostSpan) dailyCostSpan.innerText = `$0.00 USDc`;
    totalCostSpan.innerText = `$0.00 USDc`;
    if (btnBuy) {
      btnBuy.disabled = true;
      btnBuy.style.opacity = '0.5';
      btnBuy.style.cursor = 'not-allowed';
      btnBuy.innerText = state.lang === 'en' ? 'Select Traveler' : 'Selecciona Viajero';
    }
    return;
  }

  let totalDailyCost = 0;
  chks.forEach(chk => {
    const type = chk.getAttribute('data-type');
    let age = 30;
    if (type === 'main') {
      age = state.profile.age || 30;
    } else {
      const idx = parseInt(chk.getAttribute('data-index'));
      if (state.companions[idx]) {
        age = state.companions[idx].age || 30;
      }
    }
    // Age rule: > 60 has 50% surcharge
    let rate = 3.00;
    if (age > 60) rate = 4.50;
    totalDailyCost += rate;
  });

  const totalCost = days * totalDailyCost;
  
  if (dailyCostSpan) {
    dailyCostSpan.innerText = `$${totalDailyCost.toFixed(2)} USDc`;
  }
  totalCostSpan.innerText = `$${totalCost.toFixed(2)} USDc`;

  if (btnBuy) {
    btnBuy.disabled = false;
    btnBuy.style.opacity = '1';
    btnBuy.style.cursor = 'pointer';
    btnBuy.innerText = translations[state.lang]?.market_insurance_btn_buy || translations['es'].market_insurance_btn_buy || 'Contratar con Chubb';
  }
}

function openPurchaseModal(name, basePrice, isCivitatis = false) {
  selectedMarketItem = { name, basePrice, price: basePrice, isCivitatis, selectedTravelers: [] };

  const container = document.getElementById('purchase-travelers-list');
  if (container) {
    container.innerHTML = '';
    
    // Add Main Traveler checkbox
    const mainLabel = document.createElement('label');
    mainLabel.style.display = 'flex';
    mainLabel.style.alignItems = 'center';
    mainLabel.style.gap = '8px';
    mainLabel.style.fontSize = '0.75rem';
    mainLabel.style.color = '#FFF';
    mainLabel.style.cursor = 'pointer';
    mainLabel.innerHTML = `
      <input type="checkbox" class="purchase-traveler-chk" data-type="main" checked style="width: 14px; height: 14px; cursor: pointer;">
      <span>${state.profile.name || 'Tú'} (${state.lang === 'en' ? 'You' : 'Tú'} - ${state.profile.age || 30} ${state.lang === 'en' ? 'yrs' : 'años'})</span>
    `;
    container.appendChild(mainLabel);

    // Add Companions checkboxes
    state.companions.forEach((c, index) => {
      const compLabel = document.createElement('label');
      compLabel.style.display = 'flex';
      compLabel.style.alignItems = 'center';
      compLabel.style.gap = '8px';
      compLabel.style.fontSize = '0.75rem';
      compLabel.style.color = '#FFF';
      compLabel.style.cursor = 'pointer';
      compLabel.innerHTML = `
        <input type="checkbox" class="purchase-traveler-chk" data-type="companion" data-index="${index}" style="width: 14px; height: 14px; cursor: pointer;">
        <span>${c.name} (${c.relationship === 'Familiar' ? (state.lang === 'en' ? 'Family' : 'Familiar') : (state.lang === 'en' ? 'Friend' : 'Amigo/a')} - ${c.age || 30} ${state.lang === 'en' ? 'yrs' : 'años'})</span>
      `;
      container.appendChild(compLabel);
    });

    // Handle updates when checkbox selection changes
    const chks = container.querySelectorAll('.purchase-traveler-chk');
    chks.forEach(chk => {
      chk.addEventListener('change', () => {
        updatePurchaseModalPrice(basePrice);
      });
    });
  }

  // Initial pricing update
  updatePurchaseModalPrice(basePrice);

  document.getElementById('purchase-modal-overlay').classList.add('active');
}

function updatePurchaseModalPrice(basePrice) {
  const container = document.getElementById('purchase-travelers-list');
  if (!container) return;

  const chks = container.querySelectorAll('.purchase-traveler-chk:checked');
  const count = chks.length;
  
  const confirmBtn = document.getElementById('btn-purchase-confirm');
  const dict = translations[state.lang] || translations['es'];
  
  if (count === 0) {
    document.getElementById('purchase-modal-amount').innerText = `$0.00 USDc`;
    confirmBtn.innerText = state.lang === 'en' ? 'Select Traveler' : 'Selecciona Viajero';
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
    confirmBtn.style.cursor = 'not-allowed';
    selectedMarketItem.price = 0;
    selectedMarketItem.selectedTravelers = [];
    return;
  }

  const totalPrice = basePrice * count;
  selectedMarketItem.price = totalPrice;

  // Recopilar nombres de los viajeros seleccionados
  const selectedTravelers = [];
  chks.forEach(chk => {
    const type = chk.getAttribute('data-type');
    if (type === 'main') {
      selectedTravelers.push(state.profile.name || 'Tú');
    } else {
      const idx = parseInt(chk.getAttribute('data-index'));
      if (state.companions[idx]) {
        selectedTravelers.push(state.companions[idx].name);
      }
    }
  });
  selectedMarketItem.selectedTravelers = selectedTravelers;

  // Mostrar precio
  const travelersLabel = count === 1 
    ? (state.lang === 'en' ? '1 person' : '1 persona')
    : (state.lang === 'en' ? `${count} people` : `${count} personas`);
  document.getElementById('purchase-modal-amount').innerText = `$${totalPrice.toFixed(2)} USDc (${travelersLabel})`;

  if (state.balance < totalPrice) {
    confirmBtn.innerText = dict.slide_to_pay_insufficient;
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
    confirmBtn.style.cursor = 'not-allowed';
  } else {
    confirmBtn.innerText = dict.btn_confirm_pay;
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
    confirmBtn.style.cursor = 'pointer';
  }
}

function executeMarketPurchase(name, price, isCivitatis = false) {
  const dict = translations[state.lang] || translations['es'];
  const isFirstEsim = (name.includes("eSIM") || name.includes("eSim")) && price === 0;
  
  if (isCivitatis) {
    // Flujo del Bot de Reserva Automatizada de Spree
    triggerProcessingScreen(
      "Agente de Spree",
      dict.js_civitatis_bot_step1 || "Conectando con Civitatis B2B...",
      async () => {
        try {
          // Paso 2
          await new Promise(r => setTimeout(r, 1200));
          document.getElementById('proc-loading-text').innerText = dict.js_civitatis_bot_step2 || "Completando datos del pasajero...";
          
          // Paso 3
          await new Promise(r => setTimeout(r, 1200));
          document.getElementById('proc-loading-text').innerText = dict.js_civitatis_bot_step3 || "Liquidando pago corporativo...";
          
          // Paso 4
          await new Promise(r => setTimeout(r, 1200));
          document.getElementById('proc-loading-text').innerText = dict.js_civitatis_bot_step4 || "¡Voucher emitido exitosamente!";
          await new Promise(r => setTimeout(r, 600));
          
          await performActualPurchase(name, price);
        } catch (err) {
          console.warn("Fallo en simulador de Civitatis");
          switchScreen('screen-dashboard');
        }
      }
    );
  } else if (isFirstEsim) {
    // Compra del primer eSIM gratuito (Bypass backend para evitar error de amount <= 0)
    triggerProcessingScreen(
      dict.js_purchasing_service || "Adquiriendo Servicio...",
      "Aprovisionando eSIM de regalo y asociándolo a tu dispositivo...",
      async () => {
        await new Promise(r => setTimeout(r, 1500));
        localStorage.setItem("spree_esim_claimed", "true");
        
        // Agregar transacción de cortesía local
        state.transactions.unshift({
          id: "tx_esim_gift",
          merchant: name,
          fiat: "0.00",
          fiat_symbol: "$",
          usdc: "0.00",
          type: "pay",
          date: "Hoy",
          status: "Completado"
        });
        
        showSuccessScreen(
          dict.js_service_activated_title_local || "¡eSIM Acondicionada!",
          "Tu eSIM de bienvenida gratuita ha sido configurada. Revisa los detalles de activación.",
          `
          <strong>${dict.details_service || 'Servicio'}:</strong> ${name}<br>
          <strong>${dict.details_debited_amount || 'Monto Debitado'}:</strong> $0.00 USDc (Cortesía)<br>
          <strong>${dict.details_status || 'Estado'}:</strong> Activo<br>
          <span style="font-size:0.75rem; color: var(--text-muted);">El código QR de activación ha sido enviado a tu correo.</span>
          `
        );
        updateBalanceUI();
        renderTransactions();
        renderMarketItems(); // Re-render para actualizar el precio del eSIM a $15
      }
    );
  } else {
    // Compra estándar
    triggerProcessingScreen(
      dict.js_purchasing_service || "Adquiriendo Servicio...", 
      (dict.js_purchasing_desc || "Debitando $${price} USDc y generando voucher digital.").replace('${price}', price.toFixed(2)), 
      async () => {
        await performActualPurchase(name, price);
      }
    );
  }
}

async function performActualPurchase(name, price) {
  const dict = translations[state.lang] || translations['es'];
  const isEsim = name.includes("eSIM") || name.includes("eSim");
  
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/wallet/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant: name,
        amount: price,
        country: 'usd'
      })
    });
    if (res.ok) {
      const data = await res.json();
      state.balance = data.balance;
      await syncStateWithBackend();
      
      if (isEsim) {
        localStorage.setItem("spree_esim_claimed", "true");
      }
      
      showSuccessScreen(
        dict.js_service_activated_title,
        dict.js_service_activated_desc,
        `
        <strong>${dict.details_service}:</strong> ${name}<br>
        <strong>${dict.details_debited_amount}:</strong> $${price.toFixed(2)} USDc<br>
        <strong>${dict.details_status}:</strong> ${dict.details_status_desc}<br>
        <span style="font-size:0.75rem; color: var(--text-muted);">${dict.js_service_warning}</span>
        `
      );
      renderMarketItems();
    } else {
      const data = await res.json();
      alert(data.message || "Error");
      switchScreen('screen-dashboard');
    }
  } catch (err) {
    console.warn("Backend Go desconectado. Procesando compra de servicio localmente.");
    state.balance -= price;
    state.transactions.unshift({
      id: "tx_" + Date.now(),
      merchant: name,
      fiat: price.toFixed(2),
      fiat_symbol: "$",
      usdc: price.toFixed(2),
      type: "pay",
      date: "Hoy",
      status: "Completado"
    });
    
    if (isEsim) {
      localStorage.setItem("spree_esim_claimed", "true");
    }
    
    showSuccessScreen(
      dict.js_service_activated_title_local,
      dict.js_service_activated_desc_local,
      `
      <strong>${dict.details_service}:</strong> ${name}<br>
      <strong>${dict.details_debited_amount}:</strong> $${price.toFixed(2)} USDc<br>
      <strong>${dict.details_status}:</strong> ${dict.details_status_desc}<br>
      <span style="font-size:0.75rem; color: var(--text-muted);">${dict.js_service_warning}</span>
      `
    );
    updateBalanceUI();
    renderTransactions();
    renderMarketItems();
  } finally {
    selectedMarketItem = null;
  }
}

// --- UTILIDADES DE PANTALLA DE PROCESAMIENTO/ÉXITO ---
function triggerProcessingScreen(title, text, callback) {
  switchScreen('screen-processing');
  document.getElementById('proc-loading').style.display = 'flex';
  document.getElementById('proc-success').style.display = 'none';
  
  document.getElementById('proc-loading-title').innerText = title;
  document.getElementById('proc-loading-text').innerText = text;
  
  setTimeout(callback, 2000);
}

function showSuccessScreen(title, text, detailsHtml) {
  document.getElementById('proc-loading').style.display = 'none';
  document.getElementById('proc-success').style.display = 'flex';
  
  document.getElementById('proc-success-title').innerText = title;
  document.getElementById('proc-success-text').innerText = text;
  
  const detailsBox = document.getElementById('proc-success-details');
  detailsBox.innerHTML = detailsHtml;
  
  const btnClose = document.getElementById('btn-success-close');
  const newBtn = btnClose.cloneNode(true);
  btnClose.parentNode.replaceChild(newBtn, btnClose);
  
  newBtn.addEventListener('click', () => {
    switchScreen('screen-dashboard');
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(i => i.classList.remove('active'));
    navItems[0].classList.add('active'); // Billetera
  });
}

// --- LOGIC FOR MULTI-LANGUAGE (i18n) ---
function initLanguage() {
  const detected = detectBrowserLanguage();
  state.lang = detected;
  applyTranslations(detected);
  updateActiveLanguageIndicator(detected);
  
  // Wire up globe buttons click events
  const globes = [
    document.getElementById('btn-lang-onboarding'),
    document.getElementById('btn-lang-dashboard')
  ];
  
  globes.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openLanguageModal();
      });
    }
  });
  
  // Wire up cancel button inside modal
  const cancelBtn = document.getElementById('btn-lang-modal-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeLanguageModal();
    });
  }
  
  // Wire up modal background click to close
  const overlay = document.getElementById('language-modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeLanguageModal();
      }
    });
  }
  
  // Wire up language buttons inside list
  const langBtns = document.querySelectorAll('.lang-option-btn');
  langBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang');
      setLanguage(lang);
      closeLanguageModal();
    });
  });
}

function detectBrowserLanguage() {
  const stored = localStorage.getItem('app_lang');
  if (stored && translations[stored]) {
    return stored;
  }
  
  const browserLang = (navigator.language || navigator.userLanguage || 'es').substring(0, 2).toLowerCase();
  if (translations[browserLang]) {
    return browserLang;
  }
  
  return 'es';
}

function applyTranslations(lang) {
  const dict = translations[lang] || translations['es'];
  
  document.documentElement.setAttribute('lang', lang);
  
  // Translate elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.innerText = dict[key];
    }
  });
  
  // Translate placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key]) {
      el.setAttribute('placeholder', dict[key]);
    }
  });
  
  // Re-run dynamic UI updates to apply translations
  if (window.updateActiveCardLabel) {
    window.updateActiveCardLabel();
  }
  updateBalanceUI();
  renderTransactions();
}

function setLanguage(lang) {
  if (translations[lang]) {
    state.lang = lang;
    localStorage.setItem('app_lang', lang);
    applyTranslations(lang);
    updateActiveLanguageIndicator(lang);
  }
}

function updateActiveLanguageIndicator(lang) {
  const langBtns = document.querySelectorAll('.lang-option-btn');
  langBtns.forEach(btn => {
    const btnLang = btn.getAttribute('data-lang');
    if (btnLang === lang) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
}

function openLanguageModal() {
  const overlay = document.getElementById('language-modal-overlay');
  if (overlay) {
    overlay.classList.add('active');
  }
}

function closeLanguageModal() {
  const overlay = document.getElementById('language-modal-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

function translateDynamicText(text) {
  const dict = translations[state.lang] || translations['es'];
  if (text === "Pre-carga Tarjeta" || text === "Card Pre-load" || text === "Precharge Carte" || text === "Kartenaufladung") return dict.tx_load;
  if (text === "Reembolso Tarjeta" || text === "Card Refund" || text === "Remboursement Carte" || text === "Karten-Erstattung") return dict.tx_refund;
  if (text === "Pago" || text === "Payment" || text === "Paiement" || text === "Zahlung") return dict.tx_pay;
  if (text === "Completado" || text === "Completed" || text === "Terminé" || text === "Abgeschlossen") return dict.tx_status_completed;
  if (text === "Hoy" || text === "Today" || text === "Aujourd'hui" || text === "Heute") return dict.tx_today;
  return text;
}

// --- FLUJO 7: SOPORTE Y REPORTES (CON CHATBOT) ---
let isBotTyping = false;

function appendChatBubble(text, sender) {
  const history = document.getElementById('chat-history');
  if (!history) return;

  const bubbleContainer = document.createElement('div');
  bubbleContainer.className = `chat-bubble-container ${sender}`;

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.innerHTML = sender === 'bot' 
    ? '<i class="fa-solid fa-robot"></i>' 
    : '<i class="fa-solid fa-user"></i>';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = text.replace(/\n/g, '<br>');

  bubbleContainer.appendChild(avatar);
  bubbleContainer.appendChild(bubble);
  history.appendChild(bubbleContainer);

  history.scrollTop = history.scrollHeight;
}

function showTypingIndicator() {
  if (isBotTyping) return;
  isBotTyping = true;
  
  const history = document.getElementById('chat-history');
  if (!history) return;

  const container = document.createElement('div');
  container.className = 'chat-bubble-container bot';
  container.id = 'chat-typing-indicator';

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.innerHTML = '<i class="fa-solid fa-robot"></i>';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;

  container.appendChild(avatar);
  container.appendChild(bubble);
  history.appendChild(container);
  history.scrollTop = history.scrollHeight;
}

function hideTypingIndicator() {
  const indicator = document.getElementById('chat-typing-indicator');
  if (indicator) {
    indicator.remove();
  }
  isBotTyping = false;
}

function initChatbotWelcome() {
  const history = document.getElementById('chat-history');
  if (!history) return;

  if (history.children.length === 0) {
    const dict = translations[state.lang] || translations['es'];
    appendChatBubble(dict.chat_welcome_msg, 'bot');
  }
}
window.initChatbotWelcome = initChatbotWelcome;

async function handleChatSubmit() {
  const input = document.getElementById('chat-message-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  input.value = '';

  appendChatBubble(text, 'user');
  showTypingIndicator();

  const phone = document.getElementById('phone-number').value || "+39 312 998 8776";
  const lang = state.lang;

  try {
    const res = await fetch(`${API_BASE}/api/support/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, lang, phone })
    });

    hideTypingIndicator();

    if (res.ok) {
      const data = await res.json();
      appendChatBubble(data.reply, 'bot');
      
      // Sincronizar el estado de la billetera (balance y transacciones) tras interactuar con el chatbot
      await syncStateWithBackend();
      
      if (data.create_incident) {
        console.log("[Support Chatbot] Escalación realizada. Se creó ticket en el backend.");
      }
    } else {
      const dict = translations[state.lang] || translations['es'];
      appendChatBubble(dict.js_error_sending_otp || "Error de comunicación con el asistente.", 'bot');
    }
  } catch (err) {
    console.warn("Backend Go desconectado. Generando respuesta simulada local.");
    setTimeout(() => {
      hideTypingIndicator();
      const dict = translations[state.lang] || translations['es'];
      let reply = "";
      const lowerText = text.toLowerCase();
      
      if (lowerText.includes("carg") || lowerText.includes("load") || lowerText.includes("fond") || lowerText.includes("depo") || lowerText.includes("tarjeta") || lowerText.includes("card")) {
        reply = dict.preload_desc;
      } else if (lowerText.includes("reemb") || lowerText.includes("refund") || lowerText.includes("devol") || lowerText.includes("retir")) {
        reply = dict.refund_desc;
      } else if (lowerText.includes("qr") || lowerText.includes("pag") || lowerText.includes("pay")) {
        reply = dict.scan_subtitle;
      } else if (lowerText.includes("comis") || lowerText.includes("fee") || lowerText.includes("cost") || lowerText.includes("charg")) {
        reply = dict.details_preload_fee + " / " + dict.details_refund_fee;
      } else if (lowerText.includes("agent") || lowerText.includes("soport") || lowerText.includes("ticket") || lowerText.includes("humano")) {
        const ticketId = 'inc_mock_' + Math.random().toString(36).substr(2, 6);
        reply = dict.js_incident_sent_success.replace('{id}', ticketId);
      } else {
        reply = dict.chat_welcome_msg;
      }
      
      appendChatBubble(reply, 'bot');
    }, 1000);
  }
}

function initSupport() {
  const btnSubmit = document.getElementById('btn-submit-support');
  const categorySelect = document.getElementById('support-category');
  const subjectInput = document.getElementById('support-subject');
  const messageInput = document.getElementById('support-message');
  const successMsg = document.getElementById('support-success-msg');

  // Registrar descargas simuladas
  const downloadBtns = document.querySelectorAll('.btn-download');
  downloadBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const platform = btn.getAttribute('data-platform');
      console.log(`[Download Mock] Click registrado para: ${platform}`);
      
      const originalText = btn.innerHTML;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cargando...`;
      btn.disabled = true;
      
      try {
        await fetch(`${API_BASE}/api/admin/downloads/click`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform })
        });
      } catch (err) {
        console.warn("Backend Go desconectado para tracker de descargas.");
      }
      
      setTimeout(() => {
        btn.innerHTML = `<i class="fa-solid fa-check"></i> Instalar`;
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.disabled = false;
        }, 1500);
      }, 800);
    });
  });

  // Selector segmentado de Soporte
  const tabChatBtn = document.getElementById('btn-tab-chat');
  const tabTicketBtn = document.getElementById('btn-tab-ticket');
  const chatView = document.getElementById('support-chat-view');
  const ticketView = document.getElementById('support-ticket-view');

  if (tabChatBtn && tabTicketBtn) {
    tabChatBtn.addEventListener('click', () => {
      tabChatBtn.classList.add('active');
      tabTicketBtn.classList.remove('active');
      chatView.style.display = 'flex';
      ticketView.style.display = 'none';
      initChatbotWelcome();
    });

    tabTicketBtn.addEventListener('click', () => {
      tabTicketBtn.classList.add('active');
      tabChatBtn.classList.remove('active');
      ticketView.style.display = 'block';
      chatView.style.display = 'none';
    });
  }

  // Enviar mensaje en Chatbot
  const btnChatSend = document.getElementById('btn-chat-send');
  const chatInput = document.getElementById('chat-message-input');

  if (btnChatSend && chatInput) {
    btnChatSend.addEventListener('click', handleChatSubmit);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleChatSubmit();
      }
    });
  }

  // Enviar Ticket Tradicional
  if (btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
      const category = categorySelect.value;
      const subject = subjectInput.value.trim();
      const message = messageInput.value.trim();
      
      const dict = translations[state.lang] || translations['es'];
      
      if (!subject || !message) {
        alert(state.lang === 'es' ? "Por favor completa el asunto y el mensaje." : "Please fill in the subject and message.");
        return;
      }
      
      btnSubmit.innerHTML = `${state.lang === 'es' ? 'Enviando...' : 'Sending...'} <i class="fa-solid fa-spinner fa-spin"></i>`;
      btnSubmit.disabled = true;
      
      const phone = document.getElementById('phone-number').value || "+39 312 998 8776";
      
      try {
        const res = await fetch(`${API_BASE}/api/admin/incidents/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, category, subject, message })
        });
        
        if (res.ok) {
          const data = await res.json();
          successMsg.innerText = dict.js_incident_sent_success.replace('{id}', data.id);
          successMsg.style.display = 'block';
          
          subjectInput.value = '';
          messageInput.value = '';
          
          setTimeout(() => {
            successMsg.style.display = 'none';
            switchScreen('screen-dashboard');
          }, 3000);
        } else {
          alert("Error al enviar el reporte.");
        }
      } catch (err) {
        console.warn("Backend Go desconectado. Simulando envío local.");
        successMsg.innerText = dict.js_incident_sent_success.replace('{id}', 'inc_mock_' + Math.random().toString(36).substr(2, 6));
        successMsg.style.display = 'block';
        
        subjectInput.value = '';
        messageInput.value = '';
        
        setTimeout(() => {
          successMsg.style.display = 'none';
          switchScreen('screen-dashboard');
        }, 3000);
      } finally {
        btnSubmit.innerHTML = `<span data-i18n="btn_send_incident">${dict.btn_send_incident}</span> <i class="fa-solid fa-paper-plane"></i>`;
        btnSubmit.disabled = false;
      }
    });
  }
}

// --- SECCIÓN: CUENTA PERSONAL Y COMPAÑEROS DE VIAJE ---
function initProfileScreen() {
  const btnUserProfile = document.getElementById('btn-user-profile');
  const btnCloseProfile = document.getElementById('btn-close-profile');
  const btnSaveProfile = document.getElementById('btn-save-profile');
  const btnShowAddCompanion = document.getElementById('btn-show-add-companion');
  const btnConfirmAddCompanion = document.getElementById('btn-confirm-add-companion');
  const btnCancelAddCompanion = document.getElementById('btn-cancel-add-companion');
  const addCompanionForm = document.getElementById('add-companion-form');
  const profileSaveSuccess = document.getElementById('profile-save-success');

  // Update initials on load
  updateUserAvatarInitials();

  // Navigation handlers
  if (btnUserProfile) {
    btnUserProfile.addEventListener('click', () => {
      // Load current profile state into input fields
      document.getElementById('profile-name').value = state.profile.name || '';
      document.getElementById('profile-passport').value = state.profile.passport || '';
      document.getElementById('profile-phone').value = state.profile.phone || '';
      document.getElementById('profile-age').value = state.profile.age || '';
      
      // Update KYC section UI
      updateProfileKycUI();
      
      // Render companions list
      renderCompanionsList();
      
      // Hide add companion form by default
      if (addCompanionForm) addCompanionForm.style.display = 'none';
      
      // Switch screen
      switchScreen('screen-profile');
    });
  }

  const btnUpgradeKyc = document.getElementById('btn-profile-upgrade-kyc');
  if (btnUpgradeKyc) {
    btnUpgradeKyc.addEventListener('click', () => {
      targetKycUpgrade = state.kycTier === 1 ? 2 : 3;
      switchScreen('screen-onboarding');
      const step1 = document.getElementById('onboarding-step-1');
      const step2 = document.getElementById('onboarding-step-2');
      const step3 = document.getElementById('onboarding-step-3');
      const step4 = document.getElementById('onboarding-step-4');
      if (step1) step1.style.display = 'none';
      if (step2) step2.style.display = 'none';
      if (step3) step3.style.display = 'none';
      if (step4) {
        step4.style.display = 'block';
        resetPassportScanUI();
      }
    });
  }

  if (btnCloseProfile) {
    btnCloseProfile.addEventListener('click', () => {
      switchScreen('screen-dashboard');
    });
  }

  // Save profile info
  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', () => {
      const name = document.getElementById('profile-name').value;
      const passport = document.getElementById('profile-passport').value;
      const phone = document.getElementById('profile-phone').value;
      const age = parseInt(document.getElementById('profile-age').value) || 30;

      state.profile = { name, passport, phone, age };
      localStorage.setItem('spree_profile', JSON.stringify(state.profile));

      // Update UI initials
      updateUserAvatarInitials();

      // Show success msg
      if (profileSaveSuccess) {
        profileSaveSuccess.style.display = 'block';
        setTimeout(() => {
          profileSaveSuccess.style.display = 'none';
        }, 3000);
      }
    });
  }

  // Show add companion form
  if (btnShowAddCompanion) {
    btnShowAddCompanion.addEventListener('click', () => {
      if (addCompanionForm) {
        addCompanionForm.style.display = addCompanionForm.style.display === 'none' ? 'block' : 'none';
      }
    });
  }

  // Confirm add companion
  if (btnConfirmAddCompanion) {
    btnConfirmAddCompanion.addEventListener('click', () => {
      const name = document.getElementById('companion-name').value;
      const relationship = document.getElementById('companion-relationship').value;
      const passport = document.getElementById('companion-passport').value;
      const age = parseInt(document.getElementById('companion-age').value) || 30;

      if (!name.trim()) {
        alert("Por favor ingrese el nombre del compañero.");
        return;
      }

      const newCompanion = { name, relationship, passport, age };
      state.companions.push(newCompanion);
      localStorage.setItem('spree_companions', JSON.stringify(state.companions));

      // Clear inputs
      document.getElementById('companion-name').value = '';
      document.getElementById('companion-passport').value = '';
      document.getElementById('companion-age').value = '';

      // Hide form
      if (addCompanionForm) addCompanionForm.style.display = 'none';

      // Re-render
      renderCompanionsList();
    });
  }

  // Cancel add companion
  if (btnCancelAddCompanion) {
    btnCancelAddCompanion.addEventListener('click', () => {
      // Clear inputs
      document.getElementById('companion-name').value = '';
      document.getElementById('companion-passport').value = '';
      document.getElementById('companion-age').value = '';
      if (addCompanionForm) addCompanionForm.style.display = 'none';
    });
  }
}

function updateUserAvatarInitials() {
  const btnUserProfile = document.getElementById('btn-user-profile');
  if (btnUserProfile && state.profile && state.profile.name) {
    const parts = state.profile.name.trim().split(/\s+/);
    let initials = '';
    if (parts.length > 0 && parts[0]) {
      initials += parts[0][0].toUpperCase();
    }
    if (parts.length > 1 && parts[1]) {
      initials += parts[1][0].toUpperCase();
    }
    btnUserProfile.innerText = initials || 'US';
  }
}

function renderCompanionsList() {
  const container = document.getElementById('companions-list');
  if (!container) return;

  container.innerHTML = '';
  
  if (state.companions.length === 0) {
    const dict = translations[state.lang] || translations['es'];
    container.innerHTML = `
      <div style="font-size:0.75rem; color:var(--text-muted); text-align:center; padding: 10px 0;">
        ${state.lang === 'en' ? 'No companions registered yet.' : 'Aún no tienes compañeros registrados.'}
      </div>
    `;
    return;
  }

  state.companions.forEach((c, index) => {
    const card = document.createElement('div');
    card.style.display = 'flex';
    card.style.justifyContent = 'space-between';
    card.style.alignItems = 'center';
    card.style.background = 'rgba(255, 255, 255, 0.03)';
    card.style.border = '0.5px solid var(--divider-color)';
    card.style.borderRadius = '8px';
    card.style.padding = '8px 12px';
    
    // Get localized relationship
    const relText = c.relationship === 'Familiar' 
      ? (state.lang === 'en' ? 'Family' : 'Familiar') 
      : (state.lang === 'en' ? 'Friend' : 'Amigo/a');

    card.innerHTML = `
      <div>
        <div style="font-weight: 600; font-size: 0.8rem; color: #FFF;">${c.name}</div>
        <div style="font-size: 0.7rem; color: var(--text-muted);">
          ${relText} • ${c.passport || 'S/D'} • ${c.age} ${state.lang === 'en' ? 'years old' : 'años'}
        </div>
      </div>
      <i class="fa-solid fa-trash-can" data-index="${index}" style="cursor: pointer; color: var(--error-color); font-size: 0.85rem; padding: 6px;"></i>
    `;

    card.querySelector('.fa-trash-can').addEventListener('click', (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'));
      state.companions.splice(idx, 1);
      localStorage.setItem('spree_companions', JSON.stringify(state.companions));
      renderCompanionsList();
    });

    container.appendChild(card);
  });
}

// --- SECCIÓN: ALQUILER DE AUTOS ---
function openCarRentalModal() {
  const modal = document.getElementById('car-rental-modal-overlay');
  if (modal) modal.classList.add('active');

  const driverSelect = document.getElementById('car-driver');
  if (driverSelect) {
    driverSelect.innerHTML = '';
    
    // Primary driver (Main Traveler)
    const mainOpt = document.createElement('option');
    mainOpt.value = state.profile.name || 'Tú';
    mainOpt.innerText = `${state.profile.name || 'Tú'} (${state.lang === 'en' ? 'You - Main Traveler' : 'Tú - Viajero Principal'})`;
    driverSelect.appendChild(mainOpt);

    // Companions
    state.companions.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.innerText = `${c.name} (${c.relationship === 'Familiar' ? (state.lang === 'en' ? 'Family' : 'Familiar') : (state.lang === 'en' ? 'Friend' : 'Amigo/a')})`;
      driverSelect.appendChild(opt);
    });
  }

  // Reset optional insurance checkbox and days
  const insuranceChk = document.getElementById('car-insurance-opt');
  if (insuranceChk) insuranceChk.checked = false;
  
  const daysInput = document.getElementById('car-days');
  if (daysInput) daysInput.value = 5;

  const carTypeSelect = document.getElementById('car-type');
  if (carTypeSelect) carTypeSelect.value = 'compact';

  updateCarRentalPrice();
}

function closeCarRentalModal() {
  const modal = document.getElementById('car-rental-modal-overlay');
  if (modal) modal.classList.remove('active');
}

function updateCarRentalPrice() {
  const typeSelect = document.getElementById('car-type');
  const daysInput = document.getElementById('car-days');
  const insuranceChk = document.getElementById('car-insurance-opt');
  const dailyCostSpan = document.getElementById('car-daily-cost');
  const totalCostSpan = document.getElementById('car-total-cost');
  const btnBuy = document.getElementById('btn-car-rental-buy');

  if (!typeSelect || !daysInput || !totalCostSpan) return;

  const selectedOpt = typeSelect.options[typeSelect.selectedIndex];
  const baseRate = selectedOpt ? parseFloat(selectedOpt.getAttribute('data-price')) : 35;

  let days = parseInt(daysInput.value) || 0;
  if (days < 1) days = 1;
  if (days > 30) days = 30;
  daysInput.value = days;

  const hasInsurance = insuranceChk ? insuranceChk.checked : false;
  const dailyRate = baseRate + (hasInsurance ? 10.00 : 0.00);
  const totalCost = dailyRate * days;

  if (dailyCostSpan) {
    dailyCostSpan.innerText = `$${dailyRate.toFixed(2)} USDc`;
  }
  totalCostSpan.innerText = `$${totalCost.toFixed(2)} USDc`;

  if (btnBuy) {
    const dict = translations[state.lang] || translations['es'];
    if (state.balance < totalCost) {
      btnBuy.innerText = dict.slide_to_pay_insufficient || "Saldo Insuficiente";
      btnBuy.disabled = true;
      btnBuy.style.opacity = '0.5';
      btnBuy.style.cursor = 'not-allowed';
    } else {
      btnBuy.innerText = dict.market_car_btn_buy || "Reservar Auto";
      btnBuy.disabled = false;
      btnBuy.style.opacity = '1';
      btnBuy.style.cursor = 'pointer';
    }
  }
}



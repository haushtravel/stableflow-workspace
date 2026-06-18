package main

import (
	"bufio"
	crand "crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// FX rates (1 USDC = 1200 ARS / 5 BRL)
var fxRates = map[string]float64{
	"ars": 1200.0,
	"brl": 5.0,
}

// Uptime tracker
var startTime = time.Now()

// --- ESTRUCTURAS Y CONSTANTES DE SEGURIDAD ---

const AdminToken = "admin_secret_token_123"

var authorizedMerchants = map[string]bool{
	"Restaurante El Gaucho": true,
	"Quiosque Copacabana":   true,
}

type UserSession struct {
	Phone     string
	CreatedAt time.Time
}

var (
	sessionsMu sync.RWMutex
	sessions   = make(map[string]UserSession) // token -> UserSession
)

func generateToken() string {
	b := make([]byte, 32)
	if _, err := crand.Read(b); err != nil {
		return fmt.Sprintf("sess_%d_%d", time.Now().UnixNano(), rand.Int63())
	}
	return fmt.Sprintf("sess_%x", b)
}

func validateSession(r *http.Request) (string, bool) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return "", false
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return "", false
	}
	token := parts[1]

	sessionsMu.RLock()
	sess, exists := sessions[token]
	sessionsMu.RUnlock()

	if !exists {
		return "", false
	}
	if time.Since(sess.CreatedAt) > 24*time.Hour {
		sessionsMu.Lock()
		delete(sessions, token)
		sessionsMu.Unlock()
		return "", false
	}

	return sess.Phone, true
}

func sessionMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if setupCORS(&w, r) {
			return
		}
		if r.Method == http.MethodOptions {
			return
		}
		_, ok := validateSession(r)
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"message": "Sesión inválida o expirada. Por favor inicie sesión nuevamente.",
			})
			return
		}
		next(w, r)
	}
}

func adminMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if setupCORS(&w, r) {
			return
		}
		if r.Method == http.MethodOptions {
			return
		}
		// Bypasear endpoints consumidos por la app cliente
		if r.URL.Path == "/api/admin/downloads/click" || r.URL.Path == "/api/admin/incidents/create" {
			next(w, r)
			return
		}
		authHeader := r.Header.Get("Authorization")
		valid := false
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
				if subtle.ConstantTimeCompare([]byte(parts[1]), []byte(AdminToken)) == 1 {
					valid = true
				}
			}
		}
		if !valid {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"message": "Acceso de administrador no autorizado.",
			})
			return
		}
		next(w, r)
	}
}

type IdempotencyRecord struct {
	Timestamp time.Time
}

var (
	idempotencyKeysMu sync.Mutex
	idempotencyKeys   = make(map[string]IdempotencyRecord) // key -> Record
)

func checkIdempotency(key string) bool {
	if key == "" {
		return true
	}
	idempotencyKeysMu.Lock()
	defer idempotencyKeysMu.Unlock()

	now := time.Now()
	// Limpieza periódica de claves viejas
	for k, v := range idempotencyKeys {
		if now.Sub(v.Timestamp) > 2*time.Minute {
			delete(idempotencyKeys, k)
		}
	}

	record, exists := idempotencyKeys[key]
	if exists && now.Sub(record.Timestamp) <= 2*time.Minute {
		return false
	}

	idempotencyKeys[key] = IdempotencyRecord{
		Timestamp: now,
	}
	return true
}

type OTPRateLimiter struct {
	sync.Mutex
	lastRequest map[string]time.Time
}

var otpLimiter = &OTPRateLimiter{
	lastRequest: make(map[string]time.Time),
}

func (l *OTPRateLimiter) Allow(phone string) (bool, time.Duration) {
	l.Lock()
	defer l.Unlock()
	last, exists := l.lastRequest[phone]
	if exists {
		elapsed := time.Since(last)
		if elapsed < 60*time.Second {
			return false, 60*time.Second - elapsed
		}
	}
	l.lastRequest[phone] = time.Now()
	return true, 0
}

// ---------------------------------------------

// Incident representa una incidencia de soporte
type Incident struct {
	ID       string `json:"id"`
	Phone    string `json:"phone"`
	Category string `json:"category"`
	Subject  string `json:"subject"`
	Message  string `json:"message"`
	Status   string `json:"status"` // "open", "resolved"
	Date     string `json:"date"`
}

// DownloadStats representa estadísticas de descarga por plataforma
type DownloadStats struct {
	IOS     int `json:"ios"`
	Android int `json:"android"`
}

// Transaction representa una transacción en el historial
type Transaction struct {
	ID         string  `json:"id"`
	Merchant   string  `json:"merchant"`
	Fiat       string  `json:"fiat"`
	FiatSymbol string  `json:"fiat_symbol"`
	USDC       string  `json:"usdc"`
	Type       string  `json:"type"` // "load", "pay", "refund"
	Date       string  `json:"date"`
	Status     string  `json:"status"`
	FeeUSDC    float64 `json:"fee_usdc"`
	GasUSDC    float64 `json:"gas_usdc"`
	SpreadUSDC float64 `json:"spread_usdc"`
}// NetworkProvider representa un proveedor de red/servicio financiero
type NetworkProvider struct {
	Name       string `json:"name"`
	Status     string `json:"status"` // "operational", "latency_warning", "down"
	LatencyMs  int    `json:"latency_ms"`
	Endpoint   string `json:"endpoint"`
	LastCheck  string `json:"last_check"`
	APIVersion string `json:"api_version"`
}

type ChatSession struct {
	Step         int     `json:"step"` // 0: Idle, 1: Awaiting City, 2: Awaiting Activity, 3: Awaiting Traveler details, 4: Awaiting Email, 5: Awaiting Confirmation
	City         string  `json:"city"`
	Activity     string  `json:"activity"`
	Price        float64 `json:"price"`
	TravelerName string  `json:"traveler_name"`
	Date         string  `json:"date"`
	Email        string  `json:"email"`
}

// WalletState contiene el balance, transacciones, OTPs activos, incidencias y descargas
type WalletState struct {
	sync.RWMutex
	Balance      float64       `json:"balance"`
	Transactions []Transaction `json:"transactions"`
	OTPs         map[string]string
	Incidents    []Incident    `json:"incidents"`
	Downloads    DownloadStats `json:"downloads"`
	Providers    map[string]NetworkProvider `json:"providers"`
	ChatSessions map[string]*ChatSession    `json:"chat_sessions"`
	KYCTier      int           `json:"kyc_tier"`
}

var state = &WalletState{
	Balance: 611.90,
	KYCTier: 1,
	Transactions: []Transaction{
		{
			ID:         "tr_checkout_1",
			Merchant:   "Restaurante El Gaucho",
			Fiat:       "24000.00",
			FiatSymbol: "$",
			USDC:       "20.70",
			Type:       "pay",
			Date:       "Hoy, 10:15",
			Status:     "Completado",
			FeeUSDC:    0.60,
			GasUSDC:    0.10,
			SpreadUSDC: 0.49,
		},
		{
			ID:         "tr_bridge_2",
			Merchant:   "Pre-carga Tarjeta",
			Fiat:       "500.00",
			FiatSymbol: "$",
			USDC:       "495.00",
			Type:       "load",
			Date:       "Ayer, 18:30",
			Status:     "Completado",
			FeeUSDC:    5.00,
			GasUSDC:    0.0,
			SpreadUSDC: 0.0,
		},
		{
			ID:         "tr_checkout_2",
			Merchant:   "Quiosque Copacabana",
			Fiat:       "50.00",
			FiatSymbol: "R$",
			USDC:       "10.40",
			Type:       "pay",
			Date:       "Hace 2 días",
			Status:     "Completado",
			FeeUSDC:    0.30,
			GasUSDC:    0.10,
			SpreadUSDC: 0.29,
		},
		{
			ID:         "tr_refund_1",
			Merchant:   "Reembolso Tarjeta",
			Fiat:       "49.25",
			FiatSymbol: "$",
			USDC:       "50.00",
			Type:       "refund",
			Date:       "Hace 3 días",
			Status:     "Completado",
			FeeUSDC:    0.75,
			GasUSDC:    0.00,
			SpreadUSDC: 0.00,
		},
		{
			ID:         "tr_bridge_1",
			Merchant:   "Pre-carga Tarjeta",
			Fiat:       "200.00",
			FiatSymbol: "$",
			USDC:       "198.00",
			Type:       "load",
			Date:       "Hace 4 días",
			Status:     "Completado",
			FeeUSDC:    2.00,
			GasUSDC:    0.0,
			SpreadUSDC: 0.0,
		},
	},
	OTPs: make(map[string]string),
	ChatSessions: make(map[string]*ChatSession),
	Incidents: []Incident{
		{
			ID:       "inc_1",
			Phone:    "+39 312 998 8776",
			Category: "Carga",
			Subject:  "Retraso en acreditación de saldo",
			Message:  "Hola, realicé una carga de $200 hace 10 minutos y no la veo impactada en mi saldo. ¿Me podrían ayudar?",
			Status:   "resolved",
			Date:     "Hace 1 día",
		},
		{
			ID:       "inc_2",
			Phone:    "+39 312 998 8776",
			Category: "Pago",
			Subject:  "Error de conexión en QR Pix",
			Message:  "El escáner dio error de comunicación al pagar en el Quiosque. El cobro no se completó, pero en la app figura debitado.",
			Status:   "open",
			Date:     "Hoy, 09:12",
		},
		{
			ID:       "inc_3",
			Phone:    "+49 172 123 4567",
			Category: "Soporte",
			Subject:  "Duda sobre el reembolso",
			Message:  "¿Cuánto tarda en volver el dinero a mi tarjeta Visa alemana si solicito reembolso hoy?",
			Status:   "open",
			Date:     "Hoy, 11:30",
		},
	},
	Downloads: DownloadStats{
		IOS:     142,
		Android: 98,
	},
	Providers: map[string]NetworkProvider{
		"stripe": {
			Name:       "Stripe API (Adquirencia)",
			Status:     "operational",
			LatencyMs:  110,
			Endpoint:   "https://api.stripe.com/v1/charges",
			LastCheck:  "Hace 1 min",
			APIVersion: "2023-10-16",
		},
		"bridge": {
			Name:       "Bridge.xyz API (On-Ramp)",
			Status:     "operational",
			LatencyMs:  145,
			Endpoint:   "https://api.bridge.xyz/v1/swaps",
			LastCheck:  "Hace 2 min",
			APIVersion: "v1.2",
		},
		"bitso": {
			Name:       "Bitso API (Off-Ramp Fíat)",
			Status:     "operational",
			LatencyMs:  210,
			Endpoint:   "https://api.bitso.com/v3/transfers",
			LastCheck:  "Hace 1 min",
			APIVersion: "v3.0",
		},
		"twilio": {
			Name:       "Twilio SMS API (OTP Auth)",
			Status:     "operational",
			LatencyMs:  180,
			Endpoint:   "https://api.twilio.com/2010-04-01/Messages",
			LastCheck:  "Hace 3 min",
			APIVersion: "2010-04-01",
		},
		"polygon": {
			Name:       "Polygon RPC Node (Smart Contract)",
			Status:     "operational",
			LatencyMs:  85,
			Endpoint:   "https://polygon-mainnet.g.alchemy.com/v2",
			LastCheck:  "Hace 30 seg",
			APIVersion: "JSON-RPC 2.0",
		},
	},
}

// MemoryLogWriter captura los logs para exponerlos en la API de administración
type MemoryLogWriter struct {
	sync.Mutex
	logs []string
}

func (w *MemoryLogWriter) Write(p []byte) (n int, err error) {
	msg := strings.TrimSuffix(string(p), "\n")
	w.Lock()
	w.logs = append(w.logs, msg)
	if len(w.logs) > 50 {
		w.logs = w.logs[1:]
	}
	w.Unlock()
	return len(p), nil
}

var memLogWriter = &MemoryLogWriter{
	logs: make([]string, 0),
}

// Helper para habilitar CORS de forma segura y flexible
func setupCORS(w *http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")
	allowedOrigin := os.Getenv("ALLOWED_ORIGIN")
	
	if allowedOrigin != "" {
		(*w).Header().Set("Access-Control-Allow-Origin", allowedOrigin)
	} else if origin != "" {
		// Validar si el origin es localhost o una IP de red privada local
		isLocal := false
		if strings.HasPrefix(origin, "http://localhost:") || 
		   strings.HasPrefix(origin, "http://127.0.0.1:") ||
		   strings.HasPrefix(origin, "https://localhost:") ||
		   strings.HasPrefix(origin, "https://127.0.0.1:") {
			isLocal = true
		} else {
			parsedOrigin, err := url.Parse(origin)
			if err == nil {
				host := parsedOrigin.Hostname()
				// Detectar rangos de IP de red local estándar (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
				if strings.HasPrefix(host, "192.168.") || 
				   strings.HasPrefix(host, "10.") || 
				   (strings.HasPrefix(host, "172.") && len(host) >= 6 && host[4] == '.' && host[5] >= '1' && host[5] <= '3') {
					isLocal = true
				}
			}
		}
		
		if isLocal {
			(*w).Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			(*w).Header().Set("Access-Control-Allow-Origin", "http://localhost:8080")
		}
	} else {
		(*w).Header().Set("Access-Control-Allow-Origin", "http://localhost:8080")
	}

	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	(*w).Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
	(*w).Header().Set("Access-Control-Allow-Credentials", "true")

	if r.Method == "OPTIONS" {
		(*w).WriteHeader(http.StatusOK)
		return true
	}
	return false
}

// Handler: Enviar OTP
type SendOTPReq struct {
	Phone string `json:"phone"`
}

type SendOTPRes struct {
	Success      bool   `json:"success"`
	TwilioActive bool   `json:"twilio_active"`
}

func sendTwilioSMS(to string, body string) error {
	accountSid := os.Getenv("TWILIO_ACCOUNT_SID")
	authToken := os.Getenv("TWILIO_AUTH_TOKEN")
	fromPhone := os.Getenv("TWILIO_PHONE_NUMBER")

	if accountSid == "" || authToken == "" || fromPhone == "" {
		return fmt.Errorf("credenciales de Twilio no configuradas en variables de entorno")
	}

	twilioURL := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", accountSid)

	actualTo := to
	if strings.HasPrefix(fromPhone, "whatsapp:") {
		cleanTo := strings.TrimPrefix(actualTo, "whatsapp:")
		// Normalización de número móvil para Argentina (+54 o 54):
		// WhatsApp exige el prefijo 9 después del código de país 54
		if strings.HasPrefix(cleanTo, "+54") && !strings.HasPrefix(cleanTo, "+549") {
			cleanTo = "+549" + cleanTo[3:]
		} else if strings.HasPrefix(cleanTo, "54") && !strings.HasPrefix(cleanTo, "549") {
			cleanTo = "549" + cleanTo[2:]
		}
		
		if !strings.HasPrefix(cleanTo, "whatsapp:") {
			actualTo = "whatsapp:" + cleanTo
		} else {
			actualTo = cleanTo
		}
	}

	v := url.Values{}
	v.Set("To", actualTo)
	v.Set("From", fromPhone)
	v.Set("Body", body)

	req, err := http.NewRequest(http.MethodPost, twilioURL, strings.NewReader(v.Encode()))
	if err != nil {
		return err
	}

	req.SetBasicAuth(accountSid, authToken)
	req.Header.Add("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errRes map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&errRes)
		return fmt.Errorf("error de Twilio (código %d): %v", resp.StatusCode, errRes["message"])
	}

	return nil
}

func handleSendOTP(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	var req SendOTPReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	if req.Phone == "" {
		http.Error(w, "Teléfono requerido", http.StatusBadRequest)
		return
	}

	allowed, retryAfter := otpLimiter.Allow(req.Phone)
	if !allowed {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Por favor espere %.0f segundos antes de solicitar otro código.", retryAfter.Seconds()),
		})
		return
	}

	// Generar OTP de 4 dígitos usando crypto/rand seguro (Vulnerabilidad 2)
	nBig, err := crand.Int(crand.Reader, big.NewInt(10000))
	var code string
	if err != nil {
		log.Printf("[Security WARNING] Error al generar número aleatorio seguro: %v. Usando math/rand como fallback.", err)
		code = fmt.Sprintf("%04d", rand.Intn(10000))
	} else {
		code = fmt.Sprintf("%04d", nBig.Int64())
	}
	state.Lock()
	state.OTPs[req.Phone] = code
	state.Unlock()

	messageBody := fmt.Sprintf("Tu codigo de verificacion Crux es: %s. Valido por 5 minutos.", code)
	var twilioErr error

	// Verificar si Twilio está configurado
	accountSid := os.Getenv("TWILIO_ACCOUNT_SID")
	if accountSid != "" {
		log.Printf("[Twilio] Enviando SMS real a %s...", req.Phone)
		twilioErr = sendTwilioSMS(req.Phone, messageBody)
		if twilioErr != nil {
			log.Printf("[Twilio] Error al enviar SMS a %s: %v. Activando fallback de simulación.", req.Phone, twilioErr)
		} else {
			log.Printf("[Twilio] SMS real enviado exitosamente a %s", req.Phone)
		}
	} else {
		log.Printf("[Twilio SMS Sandbox] Credenciales de Twilio no configuradas. Simulación activa.")
	}

	// Simular retraso de red
	time.Sleep(800 * time.Millisecond)

	log.Printf("[SMS Simulator] OTP para %s es: %s", req.Phone, code)

	twilioActive := (accountSid != "" && twilioErr == nil)
	res := SendOTPRes{Success: true, TwilioActive: twilioActive}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// Handler: Verificar OTP
type VerifyOTPReq struct {
	Phone string `json:"phone"`
	Code  string `json:"code"`
}

type VerifyOTPRes struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Token   string `json:"token,omitempty"`
}

// Rate limit tracker para intentos de OTP (Vulnerabilidad 5)
type OTPAttemptTracker struct {
	sync.Mutex
	attempts map[string]int
	lockTime map[string]time.Time
}

var tracker = &OTPAttemptTracker{
	attempts: make(map[string]int),
	lockTime: make(map[string]time.Time),
}

func (t *OTPAttemptTracker) RegisterFailure(phone string) int {
	t.Lock()
	defer t.Unlock()
	t.attempts[phone]++
	if t.attempts[phone] >= 3 {
		t.lockTime[phone] = time.Now().Add(5 * time.Minute)
	}
	return t.attempts[phone]
}

func (t *OTPAttemptTracker) IsLocked(phone string) (bool, time.Duration) {
	t.Lock()
	defer t.Unlock()
	unlockAt, locked := t.lockTime[phone]
	if !locked {
		return false, 0
	}
	if time.Now().After(unlockAt) {
		delete(t.lockTime, phone)
		delete(t.attempts, phone)
		return false, 0
	}
	return true, time.Until(unlockAt)
}

func (t *OTPAttemptTracker) Reset(phone string) {
	t.Lock()
	defer t.Unlock()
	delete(t.attempts, phone)
	delete(t.lockTime, phone)
}

func handleVerifyOTP(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	var req VerifyOTPReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	// Verificar bloqueo por rate limit
	locked, timeLeft := tracker.IsLocked(req.Phone)
	if locked {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(VerifyOTPRes{
			Success: false,
			Message: fmt.Sprintf("Demasiados intentos fallidos. Teléfono bloqueado por %.0f segundos.", timeLeft.Seconds()),
		})
		return
	}

	// Simular retraso de validación
	time.Sleep(600 * time.Millisecond)

	state.Lock()
	savedCode, exists := state.OTPs[req.Phone]
	state.Unlock()

	// Validación de tiempo constante (Vulnerabilidad 2 / Timing Attacks)
	codeValid := false
	if exists && len(savedCode) == len(req.Code) {
		if subtle.ConstantTimeCompare([]byte(savedCode), []byte(req.Code)) == 1 {
			codeValid = true
		}
	}

	if !codeValid {
		attempts := tracker.RegisterFailure(req.Phone)
		w.Header().Set("Content-Type", "application/json")
		if attempts >= 3 {
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(VerifyOTPRes{
				Success: false,
				Message: "Código de verificación incorrecto. Has superado el límite de intentos. Teléfono bloqueado por 5 minutos.",
			})
		} else {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(VerifyOTPRes{
				Success: false,
				Message: fmt.Sprintf("Código de verificación incorrecto. Intentos fallidos: %d/3.", attempts),
			})
		}
		return
	}

	// Consumir el OTP una vez validado y resetear tracker
	state.Lock()
	delete(state.OTPs, req.Phone)
	state.Unlock()
	tracker.Reset(req.Phone)

	token := generateToken()
	sessionsMu.Lock()
	sessions[token] = UserSession{
		Phone:     req.Phone,
		CreatedAt: time.Now(),
	}
	sessionsMu.Unlock()

	res := VerifyOTPRes{Success: true, Message: "Verificado correctamente", Token: token}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// Handler: Obtener Balance y Tasas
type BalanceRes struct {
	Balance float64            `json:"balance"`
	Rates   map[string]float64 `json:"rates"`
	KYCTier int                `json:"kyc_tier"`
}

func handleGetBalance(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	state.RLock()
	bal := state.Balance
	kyc := state.KYCTier
	state.RUnlock()

	res := BalanceRes{
		Balance: bal,
		Rates:   fxRates,
		KYCTier: kyc,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// Handler: Actualizar Nivel de KYC
type UpdateKYCReq struct {
	Tier int `json:"tier"`
}

func handleUpdateKYC(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	var req UpdateKYCReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido o malformado", http.StatusBadRequest)
		return
	}

	if req.Tier < 1 || req.Tier > 2 {
		http.Error(w, "Nivel de KYC inválido", http.StatusBadRequest)
		return
	}

	state.Lock()
	state.KYCTier = req.Tier
	state.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"kyc_tier": req.Tier,
	})
}

// Handler: Obtener Historial de Transacciones
func handleGetTransactions(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	state.RLock()
	txs := state.Transactions
	state.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(txs)
}

// Handler: Pre-carga de Saldo (USDC desde tarjeta)
type PreloadReq struct {
	Amount        float64 `json:"amount"`
	PaymentMethod string  `json:"payment_method"`
	Token         string  `json:"token"`
}

type PreloadRes struct {
	Success      bool    `json:"success"`
	TxID         string  `json:"tx_id"`
	ReceivedUSDC float64 `json:"received_USDc"`
	Balance      float64 `json:"balance"`
}

func chargeWithStripe(token string, amountCents int) (string, error) {
	secretKey := os.Getenv("STRIPE_SECRET_KEY")
	if secretKey == "" || strings.Contains(secretKey, "PON_AQUI") {
		return "", fmt.Errorf("Stripe secret key not configured")
	}

	stripeURL := "https://api.stripe.com/v1/charges"

	v := url.Values{}
	v.Set("amount", fmt.Sprintf("%d", amountCents))
	v.Set("currency", "usd")
	v.Set("source", token)
	v.Set("description", "Crux Budget Preload")

	req, err := http.NewRequest(http.MethodPost, stripeURL, strings.NewReader(v.Encode()))
	if err != nil {
		return "", err
	}

	req.SetBasicAuth(secretKey, "")
	req.Header.Add("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var resData map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&resData); err != nil {
		return "", err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if errorData, ok := resData["error"].(map[string]interface{}); ok {
			if msg, ok := errorData["message"].(string); ok {
				return "", fmt.Errorf("Stripe error: %s", msg)
			}
		}
		return "", fmt.Errorf("Stripe charge failed with status %d", resp.StatusCode)
	}

	chargeID, _ := resData["id"].(string)
	return chargeID, nil
}

func handleConfig(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	pubKey := os.Getenv("STRIPE_PUBLISHABLE_KEY")
	if strings.Contains(pubKey, "PON_AQUI") {
		pubKey = ""
	}

	res := map[string]string{
		"stripe_publishable_key": pubKey,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func handlePreload(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	idemKey := r.Header.Get("Idempotency-Key")
	if idemKey == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Cabecera Idempotency-Key requerida.",
		})
		return
	}
	if !checkIdempotency(idemKey) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Petición duplicada (conflicto de idempotencia).",
		})
		return
	}

	var req PreloadReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	if req.Amount <= 0 {
		http.Error(w, "Monto inválido", http.StatusBadRequest)
		return
	}

	// Simular procesamiento bancario
	time.Sleep(1000 * time.Millisecond)

	var txID string
	var err error
	secretKey := os.Getenv("STRIPE_SECRET_KEY")
	stripeActive := secretKey != "" && !strings.Contains(secretKey, "PON_AQUI")

	if stripeActive && req.Token != "" && !strings.HasPrefix(req.Token, "tok_simulado") {
		log.Printf("[Stripe] Procesando cobro real de $%.2f USD con token %s...", req.Amount, req.Token)
		amountCents := int(req.Amount * 100)
		txID, err = chargeWithStripe(req.Token, amountCents)
		if err != nil {
			log.Printf("[Stripe] Error de cobro: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusPaymentRequired)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"message": err.Error(),
			})
			return
		}
		log.Printf("[Stripe] Cobro exitoso. ID: %s", txID)
	} else {
		// Modo simulación
		txID = fmt.Sprintf("tr_bridge_%d", rand.Intn(1000000))
		log.Printf("[Preload Simulator] Carga simulada exitosa por $%.2f USD. ID: %s", req.Amount, txID)
	}

	nowStr := "Hoy, " + time.Now().Format("15:04")

	feePercent := 0.01 // Default 1% for bank/ACH/SEPA/USDC
	merchantName := "Depósito Bancario (Bridge)"
	if req.PaymentMethod == "card" {
		feePercent = 0.03
		merchantName = "Pre-carga Tarjeta"
	} else if req.PaymentMethod == "googlepay" || req.PaymentMethod == "applepay" {
		feePercent = 0.02
		merchantName = "Pre-carga Móvil"
	}
	fee := req.Amount * feePercent
	netAmount := req.Amount - fee

	state.Lock()
	state.Balance += netAmount
	newTx := Transaction{
		ID:         txID,
		Merchant:   merchantName,
		Fiat:       fmt.Sprintf("%.2f", req.Amount),
		FiatSymbol: "$",
		USDC:       fmt.Sprintf("%.2f", netAmount),
		Type:       "load",
		Date:       nowStr,
		Status:     "Completado",
		FeeUSDC:    fee,
	}
	state.Transactions = append([]Transaction{newTx}, state.Transactions...)
	newBalance := state.Balance
	state.Unlock()

	res := PreloadRes{
		Success:      true,
		TxID:         txID,
		ReceivedUSDC: netAmount,
		Balance:      newBalance,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// Handler: Checkout QR (Liquidación instantánea a fiat local)
type CheckoutReq struct {
	Merchant string  `json:"merchant"`
	Amount   float64 `json:"amount"`  // Monto en moneda fiat local
	Country  string  `json:"country"` // "ars" o "brl"
}

type CheckoutRes struct {
	Success   bool    `json:"success"`
	TxID      string  `json:"tx_id"`
	FiatPaid  string  `json:"fiat_paid"`
	USDCSpent float64 `json:"usdc_spent"`
	Balance   float64 `json:"balance"`
	Message   string  `json:"message,omitempty"`
}

func handleCheckout(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	idemKey := r.Header.Get("Idempotency-Key")
	if idemKey == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Cabecera Idempotency-Key requerida.",
		})
		return
	}
	if !checkIdempotency(idemKey) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Petición duplicada (conflicto de idempotencia).",
		})
		return
	}

	var req CheckoutReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	isMarketplace := req.Country == "usd"
	if !isMarketplace && !authorizedMerchants[req.Merchant] {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Comercio no autorizado o no registrado en la plataforma Crux.",
		})
		return
	}

	var rate float64
	var serviceFee float64
	var gasFee float64
	var totalUsdc float64
	var spreadUsdc float64

	if req.Amount <= 0 {
		http.Error(w, "Monto inválido", http.StatusBadRequest)
		return
	}

	if req.Country == "usd" {
		rate = 1.0
		serviceFee = 0.0
		gasFee = 0.0
		totalUsdc = req.Amount
		spreadUsdc = 0.0
	} else {
		var exists bool
		rate, exists = fxRates[req.Country]
		if !exists {
			http.Error(w, "País no soportado", http.StatusBadRequest)
			return
		}
		rawUsdc := req.Amount / rate
		totalUsdc = rawUsdc * 1.015 + 0.10
		spreadUsdc = 0.015 * rawUsdc + 0.10
		serviceFee = 0.0
		gasFee = 0.0
	}

	state.Lock()
	defer state.Unlock()

	if state.Balance < totalUsdc {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusPaymentRequired)
		json.NewEncoder(w).Encode(CheckoutRes{
			Success: false,
			Balance: state.Balance,
			Message: "Saldo insuficiente para cubrir el pago y las comisiones",
		})
		return
	}

	// Simular procesamiento en dos pasos (Débito + Liquidación local Rémora)
	time.Sleep(1200 * time.Millisecond)

	state.Balance -= totalUsdc
	txID := fmt.Sprintf("tr_checkout_%d", rand.Intn(1000000))
	nowStr := "Hoy, " + time.Now().Format("15:04")

	fiatSymbol := "$"
	if req.Country == "brl" {
		fiatSymbol = "R$"
	} else if req.Country == "usd" {
		fiatSymbol = "$"
	}

	newTx := Transaction{
		ID:         txID,
		Merchant:   req.Merchant,
		Fiat:       fmt.Sprintf("%.2f", req.Amount),
		FiatSymbol: fiatSymbol,
		USDC:       fmt.Sprintf("%.2f", totalUsdc),
		Type:       "pay",
		Date:       nowStr,
		Status:     "Completado",
		FeeUSDC:    serviceFee,
		GasUSDC:    gasFee,
		SpreadUSDC: spreadUsdc,
	}
	state.Transactions = append([]Transaction{newTx}, state.Transactions...)

	// Cashback Goroutine
	if req.Country == "usd" {
		go func(itemName string, purchaseAmount float64) {
			time.Sleep(60 * time.Second)
			state.Lock()
			defer state.Unlock()

			cashbackAmount := purchaseAmount * 0.05
			state.Balance += cashbackAmount

			cbTxID := fmt.Sprintf("tr_cashback_%d", rand.Intn(1000000))
			cbNowStr := "Hoy, " + time.Now().Format("15:04")

			cbTx := Transaction{
				ID:         cbTxID,
				Merchant:   fmt.Sprintf("Cashback: %s", itemName),
				Fiat:       fmt.Sprintf("%.2f", cashbackAmount),
				FiatSymbol: "$",
				USDC:       fmt.Sprintf("%.2f", cashbackAmount),
				Type:       "load",
				Date:       cbNowStr,
				Status:     "Completado",
				FeeUSDC:    0.0,
				GasUSDC:    0.0,
				SpreadUSDC: 0.0,
			}
			state.Transactions = append([]Transaction{cbTx}, state.Transactions...)
			log.Printf("[Cashback Goroutine] Acreditado $%.2f USDC de cashback para %s", cashbackAmount, itemName)
		}(req.Merchant, req.Amount)
	}

	res := CheckoutRes{
		Success:   true,
		TxID:      txID,
		FiatPaid:  fmt.Sprintf("%s%.2f", fiatSymbol, req.Amount),
		USDCSpent: totalUsdc,
		Balance:   state.Balance,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// Handler: Reembolso a Tarjeta
type RefundReq struct {
	Amount float64 `json:"amount"` // Saldo total o parcial USDC a reembolsar
}

type RefundRes struct {
	Success     bool    `json:"success"`
	TxID        string  `json:"tx_id"`
	Refunded    float64 `json:"refunded_usdc"`
	Fee         float64 `json:"fee_usdc"`
	NetReceived float64 `json:"net_received_usd"`
	Balance     float64 `json:"balance"`
	Message     string  `json:"message,omitempty"`
}

func handleRefund(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	idemKey := r.Header.Get("Idempotency-Key")
	if idemKey == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Cabecera Idempotency-Key requerida.",
		})
		return
	}
	if !checkIdempotency(idemKey) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Petición duplicada (conflicto de idempotencia).",
		})
		return
	}

	var req RefundReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	state.Lock()
	defer state.Unlock()

	if req.Amount <= 0 || state.Balance < req.Amount {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(RefundRes{
			Success: false,
			Balance: state.Balance,
			Message: "Saldo insuficiente o monto inválido para reembolso",
		})
		return
	}

	// Simular procesamiento del refund
	time.Sleep(1000 * time.Millisecond)

	fee := req.Amount * 0.005
	netReceived := req.Amount - fee
	state.Balance -= req.Amount

	txID := fmt.Sprintf("tr_refund_%d", rand.Intn(1000000))
	nowStr := "Hoy, " + time.Now().Format("15:04")

	newTx := Transaction{
		ID:         txID,
		Merchant:   "Reembolso Tarjeta",
		Fiat:       fmt.Sprintf("%.2f", netReceived),
		FiatSymbol: "$",
		USDC:       fmt.Sprintf("%.2f", req.Amount),
		Type:       "refund",
		Date:       nowStr,
		Status:     "Completado",
		FeeUSDC:    fee,
	}
	state.Transactions = append([]Transaction{newTx}, state.Transactions...)

	res := RefundRes{
		Success:     true,
		TxID:        txID,
		Refunded:    req.Amount,
		Fee:         fee,
		NetReceived: netReceived,
		Balance:     state.Balance,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// Handler: Obtener Estadísticas para el Panel Admin
type AdminStats struct {
	TotalVolume       float64 `json:"total_volume"`
	TotalEarnings     float64 `json:"total_earnings"`
	EarningsPreload   float64 `json:"earnings_preload"`
	EarningsService   float64 `json:"earnings_service"`
	EarningsSpread    float64 `json:"earnings_spread"`
	EarningsRefund    float64 `json:"earnings_refund"`
	DownloadsIOS      int     `json:"downloads_ios"`
	DownloadsAndroid  int     `json:"downloads_android"`
	IncidentsOpen     int     `json:"incidents_open"`
	IncidentsResolved int     `json:"incidents_resolved"`
	ActiveUsersCount  int     `json:"active_users_count"`
}

func handleAdminStats(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	state.RLock()
	defer state.RUnlock()

	stats := AdminStats{
		DownloadsIOS:     state.Downloads.IOS,
		DownloadsAndroid: state.Downloads.Android,
	}

	// Contar usuarios únicos por teléfono en las transacciones/incidencias
	uniqueUsers := make(map[string]bool)
	uniqueUsers["+39 312 998 8776"] = true // Usuario demo
	uniqueUsers["+49 172 123 4567"] = true // Usuario demo

	for _, tx := range state.Transactions {
		if tx.Status != "Completado" {
			continue
		}
		if tx.Type == "load" {
			stats.EarningsPreload += tx.FeeUSDC
		} else if tx.Type == "pay" {
			stats.EarningsService += tx.FeeUSDC
			stats.EarningsSpread += tx.SpreadUSDC
			
			// Calcular volumen neto pagado en USDC
			var usdcVal float64
			fmt.Sscanf(tx.USDC, "%f", &usdcVal)
			stats.TotalVolume += (usdcVal - tx.FeeUSDC - tx.GasUSDC)
		} else if tx.Type == "refund" {
			stats.EarningsRefund += tx.FeeUSDC
		}
	}

	for _, inc := range state.Incidents {
		if inc.Status == "open" {
			stats.IncidentsOpen++
		} else if inc.Status == "resolved" {
			stats.IncidentsResolved++
		}
		if inc.Phone != "" {
			uniqueUsers[inc.Phone] = true
		}
	}

	stats.TotalEarnings = stats.EarningsPreload + stats.EarningsService + stats.EarningsSpread + stats.EarningsRefund
	stats.ActiveUsersCount = len(uniqueUsers)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// Handler: Obtener sólo cargas (Preloads)
func handleAdminPreloads(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	state.RLock()
	var preloads []Transaction
	for _, tx := range state.Transactions {
		if tx.Type == "load" {
			preloads = append(preloads, tx)
		}
	}
	state.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(preloads)
}

// Handler: Obtener incidencias de soporte
func handleAdminIncidents(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	state.RLock()
	incidents := state.Incidents
	state.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(incidents)
}

// Handler: Crear incidencia de soporte (Cliente App)
type CreateIncidentReq struct {
	Phone    string `json:"phone"`
	Category string `json:"category"`
	Subject  string `json:"subject"`
	Message  string `json:"message"`
}

func handleAdminCreateIncident(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	var req CreateIncidentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	if req.Subject == "" || req.Message == "" {
		http.Error(w, "Asunto y mensaje son requeridos", http.StatusBadRequest)
		return
	}

	newInc := Incident{
		ID:       fmt.Sprintf("inc_%d", rand.Intn(1000000)),
		Phone:    req.Phone,
		Category: req.Category,
		Subject:  req.Subject,
		Message:  req.Message,
		Status:   "open",
		Date:     "Hoy, " + time.Now().Format("15:04"),
	}

	state.Lock()
	state.Incidents = append([]Incident{newInc}, state.Incidents...)
	state.Unlock()

	log.Printf("[Incident Manager] Nueva incidencia registrada: %s (%s)", newInc.ID, newInc.Subject)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(newInc)
}

// Handler: Resolver incidencia (Admin Panel)
type ResolveIncidentReq struct {
	ID string `json:"id"`
}

func handleAdminResolveIncident(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	var req ResolveIncidentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	state.Lock()
	defer state.Unlock()

	found := false
	for i, inc := range state.Incidents {
		if inc.ID == req.ID {
			state.Incidents[i].Status = "resolved"
			found = true
			break
		}
	}

	if !found {
		http.Error(w, "Incidencia no encontrada", http.StatusNotFound)
		return
	}

	log.Printf("[Incident Manager] Incidencia %s marcada como RESUELTA", req.ID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// Handler: Click de descarga de App
type DownloadClickReq struct {
	Platform string `json:"platform"`
}

func handleAdminDownloadClick(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	var req DownloadClickReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	state.Lock()
	if strings.ToLower(req.Platform) == "ios" {
		state.Downloads.IOS++
	} else if strings.ToLower(req.Platform) == "android" {
		state.Downloads.Android++
	}
	state.Unlock()

	log.Printf("[Download Tracker] Nueva descarga click registrada para plataforma: %s", req.Platform)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// Handler: Consultar clics de descarga
func handleAdminDownloads(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	state.RLock()
	downloads := state.Downloads
	state.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(downloads)
}

// Handler: Simulador dinámico
type SimulateReq struct {
	Action string `json:"action"`
}

func handleAdminSimulate(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	var req SimulateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	state.Lock()
	defer state.Unlock()

	nowStr := "Hoy, " + time.Now().Format("15:04")
	txID := fmt.Sprintf("tr_sim_%d", rand.Intn(1000000))

	switch req.Action {
	case "download":
		if rand.Float64() > 0.5 {
			state.Downloads.IOS++
		} else {
			state.Downloads.Android++
		}
	case "preload":
		amounts := []float64{100.0, 200.0, 500.0}
		amount := amounts[rand.Intn(len(amounts))]
		fee := amount * 0.01
		netAmount := amount - fee
		state.Balance += netAmount

		newTx := Transaction{
			ID:         txID,
			Merchant:   "Pre-carga Tarjeta",
			Fiat:       fmt.Sprintf("%.2f", amount),
			FiatSymbol: "$",
			USDC:       fmt.Sprintf("%.2f", netAmount),
			Type:       "load",
			Date:       nowStr,
			Status:     "Completado",
			FeeUSDC:    fee,
		}
		state.Transactions = append([]Transaction{newTx}, state.Transactions...)

	case "pay":
		merchants := []string{"Uber Latam", "Starbucks AR", "Local Empanadas", "Taxi Río BRL"}
		merchant := merchants[rand.Intn(len(merchants))]
		
		isArs := rand.Float64() > 0.5
		var fiatAmount float64
		var fiatSymbol string
		var totalUsdc float64
		var feeUsdc float64
		var gasFee float64 = 0.10
		var spreadUsdc float64

		if isArs {
			fiatAmount = float64(5000 + rand.Intn(15000))
			fiatSymbol = "$"
			rawUsdc := fiatAmount / 1200.0
			feeUsdc = rawUsdc * 0.03
			totalUsdc = rawUsdc + feeUsdc + gasFee
			spreadUsdc = rawUsdc - (fiatAmount / 1230.0)
		} else {
			fiatAmount = float64(20 + rand.Intn(80))
			fiatSymbol = "R$"
			rawUsdc := fiatAmount / 5.0
			feeUsdc = rawUsdc * 0.03
			totalUsdc = rawUsdc + feeUsdc + gasFee
			spreadUsdc = rawUsdc - (fiatAmount / 5.15)
		}

		newTx := Transaction{
			ID:         txID,
			Merchant:   merchant,
			Fiat:       fmt.Sprintf("%.2f", fiatAmount),
			FiatSymbol: fiatSymbol,
			USDC:       fmt.Sprintf("%.2f", totalUsdc),
			Type:       "pay",
			Date:       nowStr,
			Status:     "Completado",
			FeeUSDC:    feeUsdc,
			GasUSDC:    gasFee,
			SpreadUSDC: spreadUsdc,
		}
		state.Transactions = append([]Transaction{newTx}, state.Transactions...)

	case "incident":
		cats := []string{"Pago", "Carga", "Onboarding", "Soporte"}
		cat := cats[rand.Intn(len(cats))]
		subjects := []string{"Problema con saldo", "Error al escanear MODO", "SMS no llegó", "Comisión de retiro"}
		sub := subjects[rand.Intn(len(subjects))]
		
		newInc := Incident{
			ID:       fmt.Sprintf("inc_%d", rand.Intn(1000000)),
			Phone:    "+54 9 11 " + fmt.Sprintf("%08d", rand.Intn(100000000)),
			Category: cat,
			Subject:  sub,
			Message:  "Esto es una simulación de error enviada automáticamente desde el panel de control.",
			Status:   "open",
			Date:     nowStr,
		}
		state.Incidents = append([]Incident{newInc}, state.Incidents...)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// Handler: Obtener salud del sistema y proveedores
type SystemHealth struct {
	UptimeSec       int64                      `json:"uptime_sec"`
	CPUPct          float64                    `json:"cpu_pct"`
	MemoryMB        float64                    `json:"memory_mb"`
	CoreLatencyMs   int                        `json:"core_latency_ms"`
	RPS             float64                    `json:"rps"`
	Providers       map[string]NetworkProvider `json:"providers"`
	CurrentBlock    int64                      `json:"current_block"`
	PolygonGasPrice int                        `json:"polygon_gas_price"`
}

func handleAdminHealth(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	state.Lock()
	defer state.Unlock()

	uptimeSec := int64(time.Since(startTime).Seconds())

	// Simular telemetría del servidor en rangos realistas
	cpu := 3.5 + rand.Float64()*4.5 // entre 3.5% y 8%
	memory := 14.5 + rand.Float64()*0.6 // entre 14.5 MB y 15.1 MB
	latency := 4 + rand.Intn(6) // entre 4ms y 10ms
	rps := 1.2 + rand.Float64()*2.0 // entre 1.2 y 3.2 peticiones/seg
	
	// Simular incremento de bloques en Polygon
	// Bloque base + 1 bloque cada 2 segundos
	startBlock := int64(48190000)
	currentBlock := startBlock + (uptimeSec / 2)
	gasPrice := 30 + rand.Intn(15) // entre 30 y 45 Gwei

	// Actualizar tiempos de chequeo y latencias fluctuantes para proveedores operacionales
	for key, prov := range state.Providers {
		if prov.Status == "operational" {
			// Pequeñas fluctuaciones de latencia
			delta := rand.Intn(15) - 7 // -7ms a +7ms
			newLat := prov.LatencyMs + delta
			if newLat < 10 {
				newLat = 10
			}
			prov.LatencyMs = newLat
			prov.LastCheck = "Hace 30 seg"
			state.Providers[key] = prov
		}
	}

	health := SystemHealth{
		UptimeSec:       uptimeSec,
		CPUPct:          cpu,
		MemoryMB:        memory,
		CoreLatencyMs:   latency,
		RPS:             rps,
		Providers:       state.Providers,
		CurrentBlock:    currentBlock,
		PolygonGasPrice: gasPrice,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)
}

// Handler: Simular incidente/caída de proveedor externo
type SimulateIncidentReq struct {
	Provider string `json:"provider"`
	Status   string `json:"status"`
}

func handleAdminSimulateIncident(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	var req SimulateIncidentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	state.Lock()
	defer state.Unlock()

	prov, exists := state.Providers[req.Provider]
	if !exists {
		http.Error(w, "Proveedor no encontrado", http.StatusNotFound)
		return
	}

	prov.Status = req.Status
	if req.Status == "down" {
		prov.LatencyMs = 0
		prov.LastCheck = "Conexión fallida"
	} else if req.Status == "latency_warning" {
		prov.LatencyMs = 1500 + rand.Intn(500) // latencia alta de 1.5s - 2.0s
		prov.LastCheck = "Latencia alta"
	} else {
		// Restablecer valores operativos normales
		if req.Provider == "stripe" {
			prov.LatencyMs = 110
		} else if req.Provider == "bridge" {
			prov.LatencyMs = 145
		} else if req.Provider == "bitso" {
			prov.LatencyMs = 210
		} else if req.Provider == "twilio" {
			prov.LatencyMs = 180
		} else if req.Provider == "polygon" {
			prov.LatencyMs = 85
		}
		prov.LastCheck = "Hace 30 seg"
	}

	state.Providers[req.Provider] = prov
	log.Printf("[Monitoring Service] Proveedor '%s' estado actualizado a: %s", req.Provider, req.Status)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// ChatRequest representa una pregunta al bot de soporte
type ChatRequest struct {
	Message string `json:"message"`
	Lang    string `json:"lang"` // "es", "en", "it", "fr", "de"
	Phone   string `json:"phone"`
}

// ChatResponse representa la respuesta del bot
type ChatResponse struct {
	Reply          string `json:"reply"`
	CreateIncident bool   `json:"create_incident"`
	Category       string `json:"category"`
	Subject        string `json:"subject"`
}

var botReplies = map[string]map[string]string{
	"es": {
		"preload":   "<b>💳 ¿Cómo cargar saldo en tu billetera Crux?</b><br><br>Para agregar fondos a tu cuenta, ve a la pestaña <b>'Cargar'</b> en el menú inferior. Puedes utilizar los siguientes métodos:<br><br>• <b>Depósito/ACH/USDC:</b> 1% de comisión.<br>• <b>Apple Pay / Google Pay:</b> 2% de comisión.<br>• <b>Tarjetas de Crédito / Débito:</b> 3% de comisión.<br><br>Tus fondos se acreditarán de inmediato en <b>USDc</b> (dólares digitales), listos para gastar.",
		"refund":    "<b>💰 ¿Cómo retirar o reembolsar tus fondos?</b><br><br>Si tu viaje terminó y deseas devolver el saldo remanente a tu tarjeta de origen, ve a la pestaña <b>'Retirar'</b> en el menú inferior.<br><br>• <b>Comisión de retiro:</b> 0.5% sobre el total a reembolsar.<br>• <b>Tiempo de procesamiento:</b> El dinero impactará en tu cuenta bancaria internacional en un plazo de <b>2 a 5 días hábiles</b>.<br><br>Tus dólares digitales (USDc) se quemarán en la blockchain y el reembolso se procesará de forma segura.",
		"qr":        "<b>📲 Pagos con códigos QR en LATAM</b><br><br>Crux te permite pagar de forma sencilla escaneando códigos QR locales en los comercios:<br><br>• <b>En Argentina 🇦🇷:</b> Escanea cualquier código de <b>Mercado Pago</b> o <b>MODO</b>.<br>• <b>En Brasil 🇧🇷:</b> Escanea códigos del sistema <b>Pix</b>.<br><br><i>Comisiones:</i> No hay comisiones visibles de servicio ni de red. Para micropagos (≤ $15 USDc) el tipo de cambio es subsidiado (0% spread), y para macropagos (> $15 USDc) se incluye un spread del 1.5% + $0.10 USDc en el tipo de cambio.",
		"fees":      "<b>📊 Estructura de comisiones de Crux</b><br><br>Mantenemos una política de tarifas simple y transparente:<br><br>• <b>Cargas de saldo (Fondeo):</b> 1% (ACH/USDC), 2% (Apple/Google Pay), 3% (Tarjetas).<br>• <b>Pagos con códigos QR:</b> Sin comisiones fijas visibles. Tipo de cambio subsidiado en compras ≤ $15 USDc y spread del 1.5% + $0.10 USDc en compras > $15 USDc.<br>• <b>Reembolsos (Retirar saldo):</b> 0.5% del monto a retirar.<br><br><b>¡Importante!</b> No cobramos comisiones ocultas, cargos de apertura, ni costos de mantenimiento mensual o por inactividad.",
		"esim":      "<b>📶 eSIM Regional de Crux</b><br><br>Mantente conectado durante todo tu viaje sin pagar tarifas costosas de roaming:<br><br>• <b>¡Tu primera eSIM es de regalo!</b> Reclámala gratis en la pestaña <b>'Mejora tu viaje'</b>.<br>• <b>Cobertura:</b> Datos de alta velocidad en Argentina y Brasil.<br>• <b>Siguientes eSIMs:</b> Cada paquete de datos adicional de 10GB tiene un costo de <b>$15.00 USDc</b>.",
		"insurance": "<b>🛡️ Seguro de Viaje Premium</b><br><br>Viaja con total tranquilidad gracias a nuestra cobertura médica y de equipaje completa respaldada por <b>Chubb</b>:<br><br>• <b>Contratación express:</b> Cotiza y contrata tu póliza en segundos desde la pestaña <b>'Mejora tu viaje'</b>.<br>• <b>Costo flexible:</b> Solo <b>$3.00 USDc por día</b>, adaptado a la duración de tu estancia y países de destino.<br>• <b>Pago directo:</b> Se debita de forma automática de tu saldo en dólares digitales (USDc).",
		"tours":     "<b>🗺️ Reservas y Actividades Civitatis</b><br><br>¡Explora LATAM como un local! A través de nuestra alianza con <b>Civitatis</b>, puedes reservar tours, excursiones y traslados privados directamente con tu saldo de Crux:<br><br>• <b>Flujo asistido:</b> Un bot automatizado de Crux completará los formularios por ti.<br>• <b>Cómo iniciar:</b> Solo escribe <b>'tour'</b> o <b>'civitatis'</b> aquí en el chat, o pulsa el botón del bot en la sección <b>'Mejora tu viaje'</b> y dime en qué ciudad quieres realizar tu actividad (Buenos Aires o Río de Janeiro).",
		"network":   "<b>🌐 ¿Cómo funciona la tecnología de Crux?</b><br><br>Crux combina la estabilidad de los dólares digitales (USDc) con la red financiera local de LATAM:<br><br>• <b>Estabilidad:</b> Tus fondos están resguardados en USDc (equivalentes 1:1 al dólar estadounidense).<br>• <b>Conversión en tiempo real:</b> Al escanear un QR local, el backend convierte y liquida instantáneamente los fondos al comercio en moneda local mediante nuestros rieles de liquidez partners (como Bitso).",
		"limits":    "<b>⚙️ Límites de tu cuenta Crux</b><br><br>Para garantizar la seguridad de tu dinero, aplicamos los siguientes límites por defecto:<br><br>• <b>Límite diario de carga:</b> Hasta <b>$5,000 USDc</b>.<br>• <b>Límite diario de gasto:</b> Hasta <b>$5,000 USDc</b>.<br><br>Si necesitas límites mayores para tu viaje, solicita una ampliación escribiendo <b>'agente'</b> para hablar con soporte técnico.",
		"times":     "<b>⏱️ Tiempos de acreditación en Crux</b><br><br>Conoce cuánto tardan tus operaciones:<br><br>• <b>Cargas de saldo (Fondeo):</b> Inmediata. Los fondos están disponibles al instante tras autorizar el pago.<br>• <b>Pagos con códigos QR (Mercado Pago, MODO, Pix):</b> Inmediata. El comercio recibe su dinero local al instante.<br>• <b>Reembolsos (Retiros a tu tarjeta original):</b> Toma entre <b>2 a 5 días hábiles</b> en verse reflejado debido a los tiempos de liquidación de las redes bancarias internacionales.",
		"agent":     "<b>👤 Soporte Humano</b><br><br>He registrado una incidencia formal en nuestro sistema de soporte técnico. Nuestro equipo administrativo revisará tu consulta inmediatamente y se comunicará contigo a tu teléfono: <b>{phone}</b>.",
		"default":   "<b>👋 ¡Hola! Soy el asistente virtual de Crux.</b><br><br>No logré comprender del todo tu consulta. Estoy aquí para guiarte en tus operaciones. Puedes preguntarme sobre:<br><br>• <b>'cargar saldo'</b> o <b>'tarjeta'</b><br>• <b>'pagos con QR'</b> o <b>'Pix'</b><br>• <b>'comisiones'</b> o <b>'costos'</b><br>• <b>'reembolsos'</b> o <b>'retirar'</b><br>• <b>'eSIM'</b>, <b>'seguros'</b> o <b>'tours'</b><br>• Escribe <b>'agente'</b> si necesitas hablar con un soporte humano.",
	},
	"en": {
		"preload":   "<b>💳 How to load funds into your Crux wallet?</b><br><br>To add funds to your account, go to the <b>'Preload'</b> tab in the bottom menu. You can use the following methods:<br><br>• <b>Bank/ACH/USDC:</b> 1% fee.<br>• <b>Apple Pay / Google Pay:</b> 2% fee.<br>• <b>Credit / Debit Cards:</b> 3% fee.<br><br>Your funds are credited instantly as <b>USDc</b> (digital dollars) in your account.",
		"refund":    "<b>💰 How to withdraw or refund your funds?</b><br><br>If your trip is over and you want to return the remaining balance to your card, go to the <b>'Withdraw'</b> tab in the bottom menu.<br><br>• <b>Withdrawal Fee:</b> 0.5% on the total amount to be refunded.<br>• <b>Processing Time:</b> The money will reach your bank account in <b>2 to 5 business days</b>.<br><br>Your digital dollars (USDc) will be burned and refunded securely.",
		"qr":        "<b>📲 Paying with QR codes in LATAM</b><br><br>Crux allows you to easily pay by scanning local QR codes at merchants:<br><br>• <b>In Argentina 🇦🇷:</b> Scan any <b>Mercado Pago</b> or <b>MODO</b> QR code.<br>• <b>In Brazil 🇧🇷:</b> Scan Pix QR codes.<br><br><i>Fees:</i> No visible service or network fees. For micropayments (≤ $15 USDc) we use a subsidized rate (0% spread), and for macropayments (> $15 USDc) we include a 1.5% + $0.10 USDc spread in the exchange rate.",
		"fees":      "<b>📊 Crux Fee Structure</b><br><br>We keep our fees simple and transparent:<br><br>• <b>Preloads:</b> 1% (ACH/USDC), 2% (Apple/Google Pay), 3% (Cards).<br>• <b>QR Payments:</b> No visible service/gas fees. Subsidized rate for purchases ≤ $15 USDc, and 1.5% + $0.10 USDc spread for purchases > $15 USDc.<br>• <b>Refunds (Withdrawals):</b> 0.5% of the total refund.<br><br><b>Important!</b> We do not charge hidden fees, opening costs, or monthly maintenance/inactivity fees.",
		"esim":      "<b>📶 Crux Regional eSIM</b><br><br>Stay connected throughout your trip without paying expensive roaming fees:<br><br>• <b>Your first eSIM is free!</b> Claim it in the <b>'Improve Your Trip'</b> tab.<br>• <b>Coverage:</b> High-speed data in Argentina and Brazil.<br>• <b>Next eSIMs:</b> Each additional 10GB data pack costs <b>$15.00 USDc</b>.",
		"insurance": "<b>🛡️ Premium Travel Insurance</b><br><br>Travel with peace of mind with our complete medical and baggage coverage backed by <b>Chubb</b>:<br><br>• <b>Express Purchase:</b> Get a quote and buy your policy in seconds from the <b>'Improve Your Trip'</b> tab.<br>• <b>Flexible Cost:</b> Only <b>$3.00 USDc per day</b>, tailored to your trip duration and destination.<br>• <b>Direct Payment:</b> Automatically debited from your digital dollar (USDc) balance.",
		"tours":     "<b>🗺️ Civitatis Booking Assistant</b><br><br>Explore LATAM like a local! Through our partnership with <b>Civitatis</b>, you can book tours, excursions, and private transfers directly with your Crux balance:<br><br>• <b>Automated Booking:</b> A Crux bot will automatically fill out the booking details for you.<br>• <b>How to start:</b> Type <b>'tour'</b> or <b>'civitatis'</b> here in the chat, or click the bot button in <b>'Improve Your Trip'</b> to start.",
		"network":   "<b>🌐 How does Crux work?</b><br><br>Crux combines digital dollars (USDc) with local financial rails in LATAM:<br><br>• <b>Stability:</b> Your funds are kept in USDc (pegged 1:1 to the US dollar).<br>• <b>Real-time Conversion:</b> When scanning a local QR code, our backend automatically converts and settles the payment in local currency instantly.",
		"limits":    "<b>⚙️ Account Limits</b><br><br>To protect your funds, we apply the following default limits:<br><br>• <b>Daily Preload Limit:</b> Up to <b>$5,000 USDc</b>.<br>• <b>Daily Spending Limit:</b> Up to <b>$5,000 USDc</b>.<br><br>If you need higher limits, write <b>'agent'</b> to request a limit increase.",
		"times":     "<b>⏱️ Accreditation Times on Crux</b><br><br>Check the duration of your operations:<br><br>• <b>Preloads:</b> Instant. Funds are available immediately after authorizing the payment.<br>• <b>QR Payments (Mercado Pago, MODO, Pix):</b> Instant. The merchant receives their local currency immediately.<br>• <b>Refunds (Withdrawals to original card):</b> Takes <b>2 to 5 business days</b> to clear due to international banking networks.",
		"agent":     "<b>👤 Human Support</b><br><br>I have registered a formal incident in our support system. Our administrative team will review your case immediately and contact you at your phone: <b>{phone}</b>.",
		"default":   "<b>👋 Hello! I am the Crux virtual assistant.</b><br><br>I couldn't quite understand your query. I am here to help you. You can ask me about:<br><br>• <b>'preloads'</b> or <b>'card'</b><br>• <b>'QR payments'</b> or <b>'Pix'</b><br>• <b>'fees'</b> or <b>'costs'</b><br>• <b>'refunds'</b> or <b>'withdraw'</b><br>• <b>'eSIM'</b>, <b>'insurance'</b> or <b>'tours'</b><br>• Write <b>'agent'</b> if you need human support.",
	},
	"it": {
		"preload":   "<b>💳 Come ricaricare la tua Crux wallet?</b><br><br>Per aggiungere fondi, vai alla scheda <b>'Carica'</b> nel menu in basso. Puoi utilizzare:<br><br>• <b>Apple Pay / Google Pay:</b> Accredito istantaneo.<br>• <b>Carte di Credito / Debito:</b> Visa, Mastercard e altre carte internazionali.<br><br><i>Nota:</i> Applichiamo una commissione dell'<b>1%</b>. I fondi vengono accreditati istantaneamente in <b>USDc</b> (dollari digitali).",
		"refund":    "<b>💰 Come rimborsare i tuoi fondi?</b><br><br>Se desideri ritirare il saldo rimanente sulla tua carta, vai alla scheda <b>'Ritira'</b> nel menu in basso.<br><br>• <b>Commissione di ritiro:</b> 1.5%.<br>• <b>Tempo di elaborazione:</b> Il denaro arriverà sul tuo conto in <b>2-5 giorni lavorativi</b>.<br><br>I tuoi USDc verranno bruciati su Polygon e rimborsati in modo sicuro tramite Stripe.",
		"qr":        "<b>📲 Pagamenti QR in LATAM</b><br><br>Crux ti consente di pagare scansionando i codici QR locali:<br><br>• <b>In Argentina 🇦🇷:</b> Supportiamo <b>Mercado Pago</b> e <b>MODO</b>. Paghi in USDc e il negozio riceve ARS istantaneamente.<br>• <b>In Brasile 🇧🇷:</b> Supportiamo Pix. Paghi in USDc e il negozio riceve BRL istantaneamente.<br><br><i>Commissioni:</i> Applichiamo il <b>3%</b> di servizio e <b>$0.10 USDc</b> di costo transazione.",
		"fees":      "<b>📊 Tariffe Crux</b><br><br>Le nostre commissioni sono semplici e trasparenti:<br><br>• <b>Ricarica:</b> 1% del totale.<br>• <b>Pagamento QR:</b> 3% di servizio + $0.10 USDc costo transazione.<br>• <b>Rimborso (ritiro):</b> 1.5% del totale.<br><br>Non addebitiamo costi di gestione conto o inattività.",
		"esim":      "<b>📶 eSIM Crux</b><br><br>Rimani conneso per tutto il viaggio senza costi di roaming:<br><br>• <b>La tua prima eSIM è in regalo!</b> Richiedila nella scheda <b>'Migliora il tuo Viaggio'</b>.<br>• <b>Copertura:</b> Dati ad alta velocità in Argentina e Brasile.<br>• <b>Successive:</b> Ogni pacchetto da 10GB costa <b>$15.00 USDc</b>.",
		"insurance": "<b>🛡️ Assicurazione Premium</b><br><br>Viaggia protetto con la copertura medica di <b>Chubb</b>:<br><br>• <b>Preventivo express:</b> Calcola e acquista in pochi secondi da <b>'Migliora il tuo Viaggio'</b>.<br>• <b>Costo:</b> Solo <b>$3.00 USDc al giorno</b>.<br>• <b>Addebito directo:</b> Scalato automaticamente dal tuo saldo USDc.",
		"tours":     "<b>🗺️ Assistente Civitatis</b><br><br>Prenota tour e trasferimenti direttamente con il tuo saldo Crux:<br><br>• <b>Prenotazione automatica:</b> Un bot si occuperà di compilare i dati per te.<br>• <b>Come iniziare:</b> Scrivi <b>'tour'</b> o <b>'civitatis'</b> in chat, oppure clicca sul pulsante del bot nella scheda <b>'Migliora il tuo Viaggio'</b>.",
		"network":   "<b>🌐 Come funziona Crux?</b><br><br>Crux unisce USDc con i circuiti bancari locali in LATAM per conversioni e pagamenti QR istantanei al miglior tasso di cambio.",
		"limits":    "<b>⚙️ Limiti del conto</b><br><br>Applichiamo i seguenti limiti di sicurezza per impostazione predefinita:<br><br>• <b>Ricarica giornaliera:</b> Fino a <b>$5,000 USDc</b>.<br>• <b>Spesa giornaliera:</b> Fino a <b>$5,000 USDc</b>.<br><br>Scrivi <b>'agent'</b> se desideri aumentare i tuoi limiti.",
		"times":     "<b>⏱️ Tempi di accredito su Crux</b><br><br>Conosci i tempi delle tue operazioni:<br><br>• <b>Ricariche:</b> Istantanee. I fondi sono subito disponibili.<br>• <b>Pagamenti QR:</b> Istantanei. Il negozio riceve il pagamento all'istante.<br>• <b>Rimborsi su carta:</b> Richiedono da <b>2 a 5 giorni lavorativi</b> per l'elaborazione bancaria.",
		"agent":     "<b>👤 Supporto Umano</b><br><br>Ho registrato un ticket di supporto formale. Il nostro team esaminerà il caso e ti contatterà al tuo telefono: <b>{phone}</b>.",
		"default":   "<b>👋 Ciao! Sono l'assistente virtuale di Crux.</b><br><br>Non ho capito bene la tua domanda. Puoi chiedermi di:<br><br>• <b>'ricarica'</b> o <b>'carta'</b><br>• <b>'pagamenti QR'</b> o <b>'Pix'</b><br>• <b>'commissioni'</b> o <b>'tariffe'</b><br>• <b>'rimborsi'</b> o <b>'ritiro'</b><br>• <b>'eSIM'</b>, <b>'assicurazioni'</b> o <b>'tour'</b><br>• Scrivi <b>'agent'</b> per parlare con un operatore.",
	},
	"fr": {
		"preload":   "<b>💳 Comment charger votre solde Crux ?</b><br><br>Pour ajouter des fonds, allez dans l'onglet <b>'Charger'</b> dans le menu inférieur. Vous pouvez utiliser :<br><br>• <b>Apple Pay / Google Pay :</b> Crédit instantané.<br>• <b>Cartes de Crédit / Débit :</b> Visa, Mastercard et cartes internationales.<br><br><i>Note :</i> Commission de <b>1%</b>. Les fonds sont crédités instantanément en <b>USDc</b> (dollars digitaux).",
		"refund":    "<b>💰 Comment retirer ou rembourser vos fonds ?</b><br><br>Si votre voyage est terminé, retournez le solde restant sur votre carte via l'onglet <b>'Retirer'</b>.<br><br>• <b>Frais de retrait :</b> 1.5% du montant.<br>• <b>Délai :</b> L'argent arrivera sur votre compte en <b>2 à 5 jours ouvrables</b>.<br><br>Vos USDc seront brûlés sur Polygon et remboursés en toute sécurité via Stripe.",
		"qr":        "<b>📲 Paiements par code QR en LATAM</b><br><br>Crux vous permet de payer en scannant des codes QR locaux chez les commerçants :<br><br>• <b>En Argentine 🇦🇷 :</b> Scannez les codes <b>Mercado Pago</b> ou <b>MODO</b>. Payez en USDc, le marchand reçoit des ARS immédiatement.<br>• <b>Au Brésil 🇧🇷 :</b> Scannez les codes Pix. Payez en USDc, le marchand reçoit des BRL immédiatement.<br><br><i>Frais :</i> Commission de service de <b>3%</b> + <b>$0.10 USDc</b> de frais de transaction.",
		"fees":      "<b>📊 Tarification Crux</b><br><br>Nos frais sont simples et transparents :<br><br>• <b>Chargement :</b> 1% du montant.<br>• <b>Paiments QR :</b> 3% de service + $0.10 USDc par transaction.<br>• <b>Remboursements :</b> 1.5% du montant.<br><br>Aucun frais de tenue de compte ou d'inactivité.",
		"esim":      "<b>📶 eSIM Régionale Crux</b><br><br>Restez connecté tout au long de votre voyage sans frais de roaming :<br><br>• <b>Votre première eSIM est offerte !</b> Demandez-la dans l'onglet <b>'Améliorez votre Voyage'</b>.<br>• <b>Couverture :</b> Données haut débit en Argentine et au Brésil.<br>• <b>Suivantes :</b> Chaque recharge de 10Go coûte <b>$15.00 USDc</b>.",
		"insurance": "<b>🛡️ Assurance Voyage Premium</b><br><br>Voyagez l'esprit tranquille avec notre couverture médicale complète Chubb :<br><br>• <b>Devis express :</b> Obtenez un devis et achetez en quelques secondes depuis <b>'Améliorez votre Voyage'</b>.<br>• <b>Coût :</b> Seulement <b>$3.00 USDc par jour</b>.<br>• <b>Débit direct :</b> Prélevé automatiquement sur votre solde USDc.",
		"tours":     "<b>🗺️ Assistant de Réservation Civitatis</b><br><br>Réservez des excursions et des transferts directement avec votre solde Crux :<br><br>• <b>Réservation automatisée :</b> Un bot Crux s'occupe de remplir les formulaires pour vous.<br>• <b>Comment démarrer :</b> Écrivez <b>'tour'</b> ou <b>'civitatis'</b> dans le chat, ou cliquez sur le bouton de l'assistant dans l'onglet <b>'Améliorez votre Voyage'</b>.",
		"network":   "<b>🌐 Comment fonctionne Crux ?</b><br><br>Crux convertit vos dollars digitaux (USDc) en monnaie locale en temps réel lors du paiement par QR pour régler le commerçant instantanément.",
		"limits":    "<b>⚙️ Limites du compte</b><br><br>Nous appliquons des limites de sécurité quotidiennes :<br><br>• <b>Limite de chargement :</b> Jusqu'à <b>$5,000 USDc</b> par jour.<br>• <b>Limite de dépense :</b> Jusqu'à <b>$5,000 USDc</b> par jour.<br><br>Écrivez <b>'agent'</b> pour demander une augmentation de vos limites.",
		"times":     "<b>⏱️ Délais d'accréditation Crux</b><br><br>Voici les délais de vos opérations :<br><br>• <b>Chargements :</b> Instantanés. Les fonds sont disponibles immédiatement.<br>• <b>Paiements QR :</b> Instantanés. Le commerçant reçoit son argent immédiatement.<br>• <b>Remboursements :</b> Prennent <b>2 à 5 jours ouvrés</b> pour apparaître sur votre carte d'origine.",
		"agent":     "<b>👤 Support Humain</b><br><br>J'ai enregistré un ticket de support formel. Notre équipe administrative étudiera votre dossier et vous contactera au: <b>{phone}</b>.",
		"default":   "<b>👋 Bonjour ! Je suis l'assistant virtuel de Crux.</b><br><br>Je n'ai pas bien compris. Vous pouvez me poser des questions sur :<br><br>• <b>'chargements'</b> ou <b>'carte'</b><br>• <b>'paiements QR'</b> ou <b>'Pix'</b><br>• <b>'frais'</b> ou <b>'tarifs'</b><br>• <b>'remboursements'</b> ou <b>'retirer'</b><br>• <b>'eSIM'</b>, <b>'assurances'</b> ou <b>'tours'</b><br>• Écrivez <b>'agent'</b> pour parler à un conseiller.",
	},
	"de": {
		"preload":   "<b>💳 Guthaben aufladen bei Crux</b><br><br>Um Guthaben hinzuzufügen, gehen Sie auf <b>'Aufladen'</b> im Menü unten. Folgende Methoden sind verfügbar:<br><br>• <b>Apple Pay / Google Pay:</b> Sofortige Gutschrift (erfordert aktive Biometrie auf Ihrem Gerät).<br>• <b>Kredit- / Debitkarten:</b> Visa, Mastercard und andere internationale Karten.<br><br><i>Hinweis:</i> Wir berechnen <b>1%</b> Gebühr. Die Gutschrift erfolgt sofort als <b>USDc</b> (digitale Dollar).",
		"refund":    "<b>💰 Guthaben auszahlen / erstatten</b><br><br>Wenn Ihre Reise beendet ist, können Sie Ihr Restguthaben in der Registerkarte <b>'Auszahlen'</b> erstatten:<br><br>• <b>Erstattungsgebühr:</b> 1.5% des Auszahlungsbetrags.<br>• <b>Bearbeitungszeit:</b> Das Geld ist in <b>2 bis 5 Werktagen</b> auf Ihrem Bankkonto.<br><br>Ihre USDc werden auf Polygon verbrannt und die Erstattung sicher über Stripe abgewickelt.",
		"qr":        "<b>📲 QR-Zahlungen in LATAM</b><br><br>Mit Crux können Sie QR-Codes in lokalen Geschäften scannen:<br><br>• <b>In Argentinien 🇦🇷:</b> Scannen Sie <b>Mercado Pago</b> oder <b>MODO</b> QR-Codes. Sie zahlen in USDc, der Händler erhält ARS sofort.<br>• <b>In Brasilien 🇧🇷:</b> Scannen Sie Pix QR-Codes. Sie zahlen in USDc, der Händler erhält BRL sofort.<br><br><i>Gebühren:</i> <b>3%</b> Servicegebühr + <b>$0.10 USDc</b> Netzwerkgebühr pro Zahlung.",
		"fees":      "<b>📊 Crux Gebührenübersicht</b><br><br>Unsere Gebühren sind einfach und transparent:<br><br>• <b>Aufladungen:</b> 1% des Betrags.<br>• <b>QR-Zahlungen:</b> 3% Servicegebühr + $0.10 USDc Transaktionsgebühr.<br>• <b>Rückerstattungen (Auszahlung):</b> 1.5% des Betrags.<br><br>Keine Kontoführungs- oder Inaktivitätsgebühren.",
		"esim":      "<b>📶 Crux Regionale eSIM</b><br><br>Bleiben Sie während Ihrer Reise verbunden, ohne teures Roaming zu zahlen:<br><br>• <b>Ihre erste eSIM ist ein Geschenk!</b> Kostenlos anfordern unter <b>'Reise Aufwerten'</b>.<br>• <b>Abdeckung:</b> Schnelle mobile Daten in Argentinien und Brasilien.<br>• <b>Weitere eSIMs:</b> Jedes zusätzliche 10GB-Paket kostet <b>$15.00 USDc</b>.",
		"insurance": "<b>🛡️ Premium Reiseversicherung</b><br><br>Reisen Sie sicher mit dem medizinischen Schutz von <b>Chubb</b>:<br><br>• <b>Sofortiger Abschluss:</b> In wenigen Sekunden unter <b>'Reise Aufwerten'</b> abschließen.<br>• <b>Flexible Kosten:</b> Nur <b>$3.00 USDc pro Tag</b>, angepasst an Ihre Reise.<br>• <b>Direkte Zahlung:</b> Wird automatisch von Ihrem USDc-Guthaben abgebucht.",
		"tours":     "<b>🗺️ Civitatis Buchungs-Assistent</b><br><br>Buchen Sie Ausflüge und Transfers direkt mit Ihrem Crux-Guthaben:<br><br>• <b>Automatische Buchung:</b> Ein Crux-Bot füllt das Buchungsformular für Sie aus.<br>• <b>Wie starten:</b> Schreiben Sie <b>'tour'</b> oder <b>'civitatis'</b> im Chat, oder tippen Sie auf den Bot-Button unter <b>'Reise Aufwerten'</b>.",
		"network":   "<b>🌐 Wie funktioniert Crux?</b><br><br>Crux rechnet Ihre USDc (digitale Dollar) bei QR-Zahlungen in Echtzeit zum besten Kurs in lokale Währung um, um den Händler sofort zu bezahlen.",
		"limits":    "<b>⚙️ Kontolimits</b><br><br>Wir wenden standardmäßig folgende Sicherheitslimits an:<br><br>• <b>Tägliches Aufladelimit:</b> Bis zu <b>$5,000 USDc</b>.<br>• <b>Tägliches Ausgabenlimit:</b> Bis zu <b>$5,000 USDc</b>.<br><br>Schreiben Sie <b>'agent'</b>, um eine Erhöhung Ihrer Limits zu beantragen.",
		"times":     "<b>⏱️ Bearbeitungszeiten bei Crux</b><br><br>Die Dauer Ihrer Transaktionen im Überblick:<br><br>• <b>Aufladungen:</b> Sofort. Das Guthaben ist direkt verfügbar.<br>• <b>QR-Zahlungen (Mercado Pago, Pix):</b> Sofort. Der Händler erhält sein Geld direkt.<br>• <b>Erstattungen:</b> Dauern <b>2 bis 5 Werktage</b>, bis sie auf Ihrer Karte eingehen.",
		"agent":     "<b>👤 Support-Mitarbeiter</b><br><br>Ich habe ein Support-Ticket für Sie erstellt. Unser Support-Team wird den Fall prüfen und Sie unter Ihrer Nummer kontaktieren: <b>{phone}</b>.",
		"default":   "<b>👋 Hallo! Ich bin der virtuelle Assistent von Crux.</b><br><br>Ich habe Ihre Frage leider nicht verstanden. Sie können mich fragen nach:<br><br>• <b>'Aufladung'</b> oder <b>'Karte'</b><br>• <b>'QR-Zahlung'</b> oder <b>'Pix'</b><br>• <b>'Gebühren'</b> oder <b>'Kosten'</b><br>• <b>'Rückerstattung'</b> oder <b>'Auszahlung'</b><br>• <b>'eSIM'</b>, <b>'Versicherung'</b> oder <b>'Touren'</b><br>• Schreiben Sie <b>'agent'</b>, um Hilfe von einem Mitarbeiter zu erhalten.",
	},
}

func processBookingStep(session *ChatSession, msg string, phone string) ChatResponse {
	state.Lock()
	defer state.Unlock()

	msgClean := strings.TrimSpace(strings.ToLower(msg))

	if msgClean == "cancelar" || msgClean == "salir" {
		delete(state.ChatSessions, phone)
		return ChatResponse{
			Reply: "Reserva de Civitatis cancelada. ¿En qué más puedo ayudarte?",
		}
	}

	switch session.Step {
	case 1: // Esperando Ciudad
		if strings.Contains(msgClean, "buenos aires") || strings.Contains(msgClean, "buenos") || strings.Contains(msgClean, "aires") || msgClean == "ba" || msgClean == "ar" {
			session.City = "buenos_aires"
			session.Step = 2
			return ChatResponse{
				Reply: "Estas son las actividades disponibles de Civitatis para Buenos Aires:\n" +
					"1. Show de Tango en El Querandí ($60.00 USDc)\n" +
					"2. Excursión al Delta del Tigre ($35.00 USDc)\n" +
					"3. Tour Histórico por San Telmo y La Boca ($20.00 USDc)\n" +
					"4. Traslado Privado Aeropuerto EZE/AEP ($30.00 USDc)\n\n" +
					"Por favor, escribe el número (1-4) o el nombre de la actividad que deseas reservar.",
			}
		} else if strings.Contains(msgClean, "rio") || strings.Contains(msgClean, "río") || strings.Contains(msgClean, "janeiro") || msgClean == "br" {
			session.City = "rio"
			session.Step = 2
			return ChatResponse{
				Reply: "Estas son las actividades disponibles de Civitatis para Río de Janeiro:\n" +
					"1. Tour al Cristo Redentor y Pan de Azúcar ($75.00 USDc)\n" +
					"2. Paseo en Barco por Bahía de Guanabara ($40.00 USDc)\n" +
					"3. Tour de Favela Rocinha ($25.00 USDc)\n" +
					"4. Traslado Privado Aeropuerto GIG/SDU ($35.00 USDc)\n\n" +
					"Por favor, escribe el número (1-4) o el nombre de la actividad que deseas reservar.",
			}
		} else {
			return ChatResponse{
				Reply: "Lo siento, por ahora solo tengo actividades para Buenos Aires y Río de Janeiro. ¿En cuál de estas ciudades te gustaría hacer la actividad?",
			}
		}

	case 2: // Esperando Actividad
		var selectedName string
		var selectedPrice float64
		validChoice := false

		if session.City == "buenos_aires" {
			if msgClean == "1" || strings.Contains(msgClean, "tango") || strings.Contains(msgClean, "querand") {
				selectedName = "Show de Tango en El Querandí"
				selectedPrice = 60.00
				validChoice = true
			} else if msgClean == "2" || strings.Contains(msgClean, "delta") || strings.Contains(msgClean, "tigre") {
				selectedName = "Excursión al Delta del Tigre"
				selectedPrice = 35.00
				validChoice = true
			} else if msgClean == "3" || strings.Contains(msgClean, "hist") || strings.Contains(msgClean, "telmo") || strings.Contains(msgClean, "boca") || strings.Contains(msgClean, "caminito") {
				selectedName = "Tour Histórico por San Telmo y La Boca"
				selectedPrice = 20.00
				validChoice = true
			} else if msgClean == "4" || strings.Contains(msgClean, "traslado") || strings.Contains(msgClean, "aeropuerto") || strings.Contains(msgClean, "eze") || strings.Contains(msgClean, "aep") {
				selectedName = "Traslado Privado Aeropuerto EZE/AEP"
				selectedPrice = 30.00
				validChoice = true
			}
		} else if session.City == "rio" {
			if msgClean == "1" || strings.Contains(msgClean, "cristo") || strings.Contains(msgClean, "redentor") || strings.Contains(msgClean, "azucar") || strings.Contains(msgClean, "azúcar") {
				selectedName = "Tour al Cristo Redentor y Pan de Azúcar"
				selectedPrice = 75.00
				validChoice = true
			} else if msgClean == "2" || strings.Contains(msgClean, "barco") || strings.Contains(msgClean, "bahia") || strings.Contains(msgClean, "bahía") || strings.Contains(msgClean, "guanabara") {
				selectedName = "Paseo en Barco por Bahía de Guanabara"
				selectedPrice = 40.00
				validChoice = true
			} else if msgClean == "3" || strings.Contains(msgClean, "favela") || strings.Contains(msgClean, "rocinha") {
				selectedName = "Tour de Favela Rocinha"
				selectedPrice = 25.00
				validChoice = true
			} else if msgClean == "4" || strings.Contains(msgClean, "traslado") || strings.Contains(msgClean, "aeropuerto") || strings.Contains(msgClean, "gig") || strings.Contains(msgClean, "sdu") {
				selectedName = "Traslado Privado Aeropuerto GIG/SDU"
				selectedPrice = 35.00
				validChoice = true
			}
		}

		if !validChoice {
			return ChatResponse{
				Reply: "Selección inválida. Por favor, escribe el número (1-4) o el nombre de la actividad de la lista anterior.",
			}
		}

		session.Activity = selectedName
		session.Price = selectedPrice
		session.Step = 3

		return ChatResponse{
			Reply: fmt.Sprintf("Has seleccionado: %s ($%.2f USDc).\n\n"+
				"Por favor, indícame el NOMBRE COMPLETO del viajero principal y la FECHA del tour separados por coma (por ejemplo: Juan Pérez, 15/07/2026).", selectedName, selectedPrice),
		}

	case 3: // Esperando nombre de viajero y fecha
		parts := strings.Split(msg, ",")
		var name, date string
		if len(parts) >= 2 {
			name = strings.TrimSpace(parts[0])
			date = strings.TrimSpace(parts[1])
		} else {
			name = strings.TrimSpace(msg)
			date = time.Now().AddDate(0, 0, 10).Format("02/01/2006")
		}

		if name == "" {
			return ChatResponse{
				Reply: "Por favor, ingresa un nombre válido para el viajero principal.",
			}
		}

		session.TravelerName = name
		session.Date = date
		session.Step = 4

		return ChatResponse{
			Reply: fmt.Sprintf("Datos del viajero registrados: %s para el %s.\n\n"+
				"Ahora por favor indícame tu CORREO ELECTRÓNICO para enviarte el voucher de Civitatis.", name, date),
		}

	case 4: // Esperando Email
		email := strings.TrimSpace(msg)
		if !strings.Contains(email, "@") || len(email) < 5 {
			return ChatResponse{
				Reply: "Por favor, ingresa un correo electrónico válido (ejemplo: usuario@dominio.com).",
			}
		}

		session.Email = email
		session.Step = 5

		currentBalance := state.Balance

		if currentBalance < session.Price {
			return ChatResponse{
				Reply: fmt.Sprintf("¡Perfecto! Aquí tienes el resumen de tu reserva:\n"+
					"- Actividad: %s (Civitatis)\n"+
					"- Viajero: %s\n"+
					"- Fecha: %s\n"+
					"- Correo: %s\n"+
					"- Precio: $%.2f USDc\n\n"+
					"Lo siento, tu saldo actual ($%.2f USDc) es insuficiente para pagar esta actividad ($%.2f USDc). Por favor carga saldo e inténtalo de nuevo. Escribe 'cancelar' para salir.",
					session.Activity, session.TravelerName, session.Date, session.Email, session.Price, currentBalance, session.Price),
			}
		}

		return ChatResponse{
			Reply: fmt.Sprintf("¡Perfecto! Aquí tienes el resumen de tu reserva:\n"+
				"- Actividad: %s (Civitatis)\n"+
				"- Viajero: %s\n"+
				"- Fecha: %s\n"+
				"- Correo: %s\n"+
				"- Precio: $%.2f USDc\n\n"+
				"Para confirmar la compra y realizar el cobro automático desde tus fondos Crux, responde 'SÍ' o 'OK' (o escribe 'cancelar' para salir).",
				session.Activity, session.TravelerName, session.Date, session.Email, session.Price),
		}

	case 5: // Esperando Confirmación
		if msgClean == "sí" || msgClean == "si" || msgClean == "ok" || msgClean == "confirmar" {
			if state.Balance < session.Price {
				delete(state.ChatSessions, phone)
				return ChatResponse{
					Reply: fmt.Sprintf("Error en el pago: Saldo insuficiente ($%.2f USDc disponible, precio $%.2f USDc). Reserva cancelada.", state.Balance, session.Price),
				}
			}

			state.Balance -= session.Price

			txID := fmt.Sprintf("tr_civitatis_%d", rand.Intn(1000000))
			nowStr := "Hoy, " + time.Now().Format("15:04")

			newTx := Transaction{
				ID:         txID,
				Merchant:   fmt.Sprintf("%s (Civitatis ag_aid=64324)", session.Activity),
				Fiat:       fmt.Sprintf("%.2f", session.Price),
				FiatSymbol: "$",
				USDC:       fmt.Sprintf("%.2f", session.Price),
				Type:       "pay",
				Date:       nowStr,
				Status:     "Completado",
			}
			state.Transactions = append([]Transaction{newTx}, state.Transactions...)

			delete(state.ChatSessions, phone)

			return ChatResponse{
				Reply: fmt.Sprintf("¡Pago procesado con éxito! Se ha debitado $%.2f USDc de tu cuenta.\n\n"+
					"El bot ha completado la compra en Civitatis usando el código de referido ag_aid=64324.\n"+
					"Tu voucher con código CIV-64324-MOCK ha sido enviado a %s.\n\n"+
					"¡Disfruta tu viaje!", session.Price, session.Email),
			}
		} else {
			return ChatResponse{
				Reply: "Confirmación no válida. Responde 'SÍ' o 'OK' para confirmar el pago, o escribe 'cancelar' para salir del proceso.",
			}
		}
	}

	return ChatResponse{
		Reply: "Lo siento, hubo un problema con tu sesión de reserva. Por favor escribe 'tour' para iniciar nuevamente.",
	}
}

func handleSupportChat(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	phoneVal := req.Phone
	if phoneVal == "" {
		phoneVal = "+39 312 998 8776"
	}

	// Normalizar idioma
	lang := strings.ToLower(req.Lang)
	if lang != "es" && lang != "en" && lang != "it" && lang != "fr" && lang != "de" {
		lang = "es"
	}

	// Normalizar mensaje para pattern matching
	msg := strings.ToLower(req.Message)

	state.Lock()
	session, exists := state.ChatSessions[phoneVal]
	state.Unlock()

	if exists && session.Step > 0 {
		res := processBookingStep(session, req.Message, phoneVal)
		time.Sleep(800 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(res)
		return
	}

	intent := "default"
	createIncident := false
	category := "Soporte"
	subject := "Consulta Asistente Virtual"

	switch lang {
	case "es":
		if strings.Contains(msg, "tiemp") || strings.Contains(msg, "tard") || strings.Contains(msg, "veloc") || strings.Contains(msg, "rapd") || strings.Contains(msg, "inmedi") || strings.Contains(msg, "plazo") || strings.Contains(msg, "dia") {
			intent = "times"
		} else if strings.Contains(msg, "comis") || strings.Contains(msg, "cost") || strings.Contains(msg, "fee") || strings.Contains(msg, "preci") {
			intent = "fees"
		} else if strings.Contains(msg, "limit") || strings.Contains(msg, "maxim") || strings.Contains(msg, "cap") || strings.Contains(msg, "monto") {
			intent = "limits"
		} else if strings.Contains(msg, "reemb") || strings.Contains(msg, "devol") || strings.Contains(msg, "retir") || strings.Contains(msg, "reint") {
			intent = "refund"
		} else if strings.Contains(msg, "carg") || strings.Contains(msg, "fond") || strings.Contains(msg, "depo") || strings.Contains(msg, "tarjeta") {
			intent = "preload"
		} else if strings.Contains(msg, "qr") || strings.Contains(msg, "pag") || strings.Contains(msg, "comerc") || strings.Contains(msg, "pix") {
			intent = "qr"
		} else if strings.Contains(msg, "esim") || strings.Contains(msg, "chip") || strings.Contains(msg, "datos") || strings.Contains(msg, "internet") || strings.Contains(msg, "roam") || strings.Contains(msg, "conec") {
			intent = "esim"
		} else if strings.Contains(msg, "segur") || strings.Contains(msg, "cobertur") || strings.Contains(msg, "poliz") || strings.Contains(msg, "medic") || strings.Contains(msg, "chubb") {
			intent = "insurance"
		} else if strings.Contains(msg, "tour") || strings.Contains(msg, "activi") || strings.Contains(msg, "excurs") || strings.Contains(msg, "civitatis") || strings.Contains(msg, "traslad") || strings.Contains(msg, "transfer") {
			intent = "tours"
		} else if strings.Contains(msg, "funcion") || strings.Contains(msg, "como") || strings.Contains(msg, "red") || strings.Contains(msg, "oper") || strings.Contains(msg, "remora") {
			intent = "network"
		} else if strings.Contains(msg, "agent") || strings.Contains(msg, "soport") || strings.Contains(msg, "human") || strings.Contains(msg, "tick") || strings.Contains(msg, "ayuda") || strings.Contains(msg, "proble") || strings.Contains(msg, "error") || strings.Contains(msg, "fall") {
			intent = "agent"
			createIncident = true
			category = "Soporte"
			subject = "Escalación Chatbot: Soporte Humano solicitado"
		}
	case "en":
		if strings.Contains(msg, "time") || strings.Contains(msg, "speed") || strings.Contains(msg, "delay") || strings.Contains(msg, "fast") || strings.Contains(msg, "instant") || strings.Contains(msg, "how long") || strings.Contains(msg, "day") {
			intent = "times"
		} else if strings.Contains(msg, "fee") || strings.Contains(msg, "cost") || strings.Contains(msg, "charg") || strings.Contains(msg, "commis") {
			intent = "fees"
		} else if strings.Contains(msg, "limit") || strings.Contains(msg, "max") || strings.Contains(msg, "cap") || strings.Contains(msg, "amount") {
			intent = "limits"
		} else if strings.Contains(msg, "refund") || strings.Contains(msg, "withdr") || strings.Contains(msg, "return") || strings.Contains(msg, "reimbur") {
			intent = "refund"
		} else if strings.Contains(msg, "load") || strings.Contains(msg, "depo") || strings.Contains(msg, "fund") || strings.Contains(msg, "card") {
			intent = "preload"
		} else if strings.Contains(msg, "qr") || strings.Contains(msg, "pay") || strings.Contains(msg, "merchant") || strings.Contains(msg, "pix") {
			intent = "qr"
		} else if strings.Contains(msg, "esim") || strings.Contains(msg, "sim") || strings.Contains(msg, "data") || strings.Contains(msg, "internet") || strings.Contains(msg, "roam") || strings.Contains(msg, "connect") {
			intent = "esim"
		} else if strings.Contains(msg, "insur") || strings.Contains(msg, "cover") || strings.Contains(msg, "medic") || strings.Contains(msg, "policy") || strings.Contains(msg, "chubb") {
			intent = "insurance"
		} else if strings.Contains(msg, "tour") || strings.Contains(msg, "activ") || strings.Contains(msg, "excurs") || strings.Contains(msg, "civitatis") || strings.Contains(msg, "transfer") || strings.Contains(msg, "shuttl") {
			intent = "tours"
		} else if strings.Contains(msg, "work") || strings.Contains(msg, "how") || strings.Contains(msg, "network") || strings.Contains(msg, "oper") || strings.Contains(msg, "remora") {
			intent = "network"
		} else if strings.Contains(msg, "agent") || strings.Contains(msg, "support") || strings.Contains(msg, "human") || strings.Contains(msg, "tick") || strings.Contains(msg, "help") || strings.Contains(msg, "prob") || strings.Contains(msg, "err") || strings.Contains(msg, "fail") {
			intent = "agent"
			createIncident = true
			category = "Soporte"
			subject = "Escalación Chatbot: Human support requested"
		}
	case "it":
		if strings.Contains(msg, "temp") || strings.Contains(msg, "veloc") || strings.Contains(msg, "ritard") || strings.Contains(msg, "rapid") || strings.Contains(msg, "istant") || strings.Contains(msg, "giorn") {
			intent = "times"
		} else if strings.Contains(msg, "commis") || strings.Contains(msg, "cost") || strings.Contains(msg, "fee") || strings.Contains(msg, "tariff") {
			intent = "fees"
		} else if strings.Contains(msg, "limit") || strings.Contains(msg, "massim") || strings.Contains(msg, "cap") || strings.Contains(msg, "importo") {
			intent = "limits"
		} else if strings.Contains(msg, "rimb") || strings.Contains(msg, "prel") || strings.Contains(msg, "ritir") {
			intent = "refund"
		} else if strings.Contains(msg, "caric") || strings.Contains(msg, "depo") || strings.Contains(msg, "fond") || strings.Contains(msg, "cart") {
			intent = "preload"
		} else if strings.Contains(msg, "qr") || strings.Contains(msg, "pag") || strings.Contains(msg, "negoz") || strings.Contains(msg, "pix") {
			intent = "qr"
		} else if strings.Contains(msg, "esim") || strings.Contains(msg, "sim") || strings.Contains(msg, "dati") || strings.Contains(msg, "internet") || strings.Contains(msg, "roam") || strings.Contains(msg, "connes") {
			intent = "esim"
		} else if strings.Contains(msg, "assicur") || strings.Contains(msg, "copert") || strings.Contains(msg, "polizz") || strings.Contains(msg, "medic") || strings.Contains(msg, "chubb") {
			intent = "insurance"
		} else if strings.Contains(msg, "tour") || strings.Contains(msg, "attiv") || strings.Contains(msg, "escurs") || strings.Contains(msg, "civitatis") || strings.Contains(msg, "trasfer") {
			intent = "tours"
		} else if strings.Contains(msg, "funzion") || strings.Contains(msg, "come") || strings.Contains(msg, "rete") || strings.Contains(msg, "oper") || strings.Contains(msg, "remora") {
			intent = "network"
		} else if strings.Contains(msg, "agent") || strings.Contains(msg, "support") || strings.Contains(msg, "uman") || strings.Contains(msg, "tick") || strings.Contains(msg, "aiut") || strings.Contains(msg, "prob") || strings.Contains(msg, "err") {
			intent = "agent"
			createIncident = true
			category = "Soporte"
			subject = "Escalación Chatbot: Supporto umano richiesto"
		}
	case "fr":
		if strings.Contains(msg, "temp") || strings.Contains(msg, "vitesse") || strings.Contains(msg, "dela") || strings.Contains(msg, "rapide") || strings.Contains(msg, "instan") || strings.Contains(msg, "jour") {
			intent = "times"
		} else if strings.Contains(msg, "frais") || strings.Contains(msg, "commis") || strings.Contains(msg, "cout") || strings.Contains(msg, "tarif") {
			intent = "fees"
		} else if strings.Contains(msg, "limit") || strings.Contains(msg, "max") || strings.Contains(msg, "cap") || strings.Contains(msg, "montant") {
			intent = "limits"
		} else if strings.Contains(msg, "remb") || strings.Contains(msg, "retra") || strings.Contains(msg, "retir") {
			intent = "refund"
		} else if strings.Contains(msg, "charg") || strings.Contains(msg, "depo") || strings.Contains(msg, "fond") || strings.Contains(msg, "cart") {
			intent = "preload"
		} else if strings.Contains(msg, "qr") || strings.Contains(msg, "pay") || strings.Contains(msg, "commer") || strings.Contains(msg, "pix") {
			intent = "qr"
		} else if strings.Contains(msg, "esim") || strings.Contains(msg, "sim") || strings.Contains(msg, "donne") || strings.Contains(msg, "internet") || strings.Contains(msg, "roam") || strings.Contains(msg, "connex") {
			intent = "esim"
		} else if strings.Contains(msg, "assur") || strings.Contains(msg, "couvert") || strings.Contains(msg, "police") || strings.Contains(msg, "medic") || strings.Contains(msg, "chubb") {
			intent = "insurance"
		} else if strings.Contains(msg, "tour") || strings.Contains(msg, "activ") || strings.Contains(msg, "excurs") || strings.Contains(msg, "civitatis") || strings.Contains(msg, "transfer") {
			intent = "tours"
		} else if strings.Contains(msg, "fonction") || strings.Contains(msg, "comm") || strings.Contains(msg, "reseau") || strings.Contains(msg, "oper") || strings.Contains(msg, "remora") {
			intent = "network"
		} else if strings.Contains(msg, "agent") || strings.Contains(msg, "support") || strings.Contains(msg, "huma") || strings.Contains(msg, "tick") || strings.Contains(msg, "aide") || strings.Contains(msg, "prob") || strings.Contains(msg, "err") {
			intent = "agent"
			createIncident = true
			category = "Soporte"
			subject = "Escalación Chatbot: Support humain demandé"
		}
	case "de":
		if strings.Contains(msg, "zeit") || strings.Contains(msg, "geschw") || strings.Contains(msg, "dauer") || strings.Contains(msg, "schnell") || strings.Contains(msg, "sofort") || strings.Contains(msg, "tag") {
			intent = "times"
		} else if strings.Contains(msg, "gebuhr") || strings.Contains(msg, "kost") || strings.Contains(msg, "provis") {
			intent = "fees"
		} else if strings.Contains(msg, "limit") || strings.Contains(msg, "max") || strings.Contains(msg, "grenz") || strings.Contains(msg, "betrag") {
			intent = "limits"
		} else if strings.Contains(msg, "ruckers") || strings.Contains(msg, "auszahl") || strings.Contains(msg, "abheb") {
			intent = "refund"
		} else if strings.Contains(msg, "auflad") || strings.Contains(msg, "lad") || strings.Contains(msg, "einzahl") || strings.Contains(msg, "kart") {
			intent = "preload"
		} else if strings.Contains(msg, "qr") || strings.Contains(msg, "zahl") || strings.Contains(msg, "bezahl") || strings.Contains(msg, "handl") {
			intent = "qr"
		} else if strings.Contains(msg, "esim") || strings.Contains(msg, "sim") || strings.Contains(msg, "daten") || strings.Contains(msg, "internet") || strings.Contains(msg, "roam") || strings.Contains(msg, "verbind") {
			intent = "esim"
		} else if strings.Contains(msg, "versich") || strings.Contains(msg, "abdeck") || strings.Contains(msg, "polic") || strings.Contains(msg, "mediz") || strings.Contains(msg, "chubb") {
			intent = "insurance"
		} else if strings.Contains(msg, "tour") || strings.Contains(msg, "aktiv") || strings.Contains(msg, "ausflug") || strings.Contains(msg, "civitatis") || strings.Contains(msg, "transfer") {
			intent = "tours"
		} else if strings.Contains(msg, "funktion") || strings.Contains(msg, "wie") || strings.Contains(msg, "netz") || strings.Contains(msg, "oper") || strings.Contains(msg, "remora") {
			intent = "network"
		} else if strings.Contains(msg, "agent") || strings.Contains(msg, "support") || strings.Contains(msg, "mensch") || strings.Contains(msg, "tick") || strings.Contains(msg, "hilf") || strings.Contains(msg, "prob") || strings.Contains(msg, "fehl") {
			intent = "agent"
			createIncident = true
			category = "Soporte"
			subject = "Escalación Chatbot: Menschliche Unterstützung angefordert"
		}
	}

	if intent == "tours" {
		state.Lock()
		state.ChatSessions[phoneVal] = &ChatSession{
			Step: 1,
		}
		state.Unlock()

		reply := "¡Excelente! Con mi ayuda puedes reservar directamente actividades en Civitatis cobrando desde tus fondos de Crux. ¿En qué ciudad quieres realizar tu actividad? (Buenos Aires o Río de Janeiro)"
		if lang == "en" {
			reply = "Excellent! With my help you can book Civitatis activities directly, paying from your Crux balance. Which city do you want to book for? (Buenos Aires or Rio de Janeiro)"
		} else if lang == "it" {
			reply = "Eccellente! Con il mio aiuto puoi prenotare directamente le attività di Civitatis pagando dal tuo saldo Crux. In quale città vuoi prenotare? (Buenos Aires o Rio de Janeiro)"
		} else if lang == "fr" {
			reply = "Excellent ! Avec mon aide, vous pouvez réserver directement des activités Civitatis en payant depuis votre solde Crux. Pour quelle ville souhaitez-vous réserver ? (Buenos Aires ou Rio de Janeiro)"
		} else if lang == "de" {
			reply = "Hervorragend! Mit meiner Hilfe können Sie Civitatis-Aktivitäten direkt buchen und von Ihrem Crux-Guthaben bezahlen. Für welche Stadt möchten Sie buchen? (Buenos Aires oder Rio de Janeiro)"
		}

		res := ChatResponse{
			Reply: reply,
		}
		time.Sleep(800 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(res)
		return
	}

	reply := botReplies[lang][intent]
	reply = strings.ReplaceAll(reply, "{phone}", phoneVal)

	if createIncident {
		state.Lock()
		newInc := Incident{
			ID:       fmt.Sprintf("inc_%d", rand.Intn(1000000)),
			Phone:    phoneVal,
			Category: category,
			Subject:  subject,
			Message:  fmt.Sprintf("Incidencia automática abierta vía chat interactivo. Consulta original: \"%s\"", req.Message),
			Status:   "open",
			Date:     "Hoy, " + time.Now().Format("15:04"),
		}
		state.Incidents = append([]Incident{newInc}, state.Incidents...)
		state.Unlock()
		log.Printf("[Incident Manager] Ticket automático creado vía chat: %s (Usuario: %s)", newInc.ID, phoneVal)
	}

	time.Sleep(800 * time.Millisecond)

	res := ChatResponse{
		Reply:          reply,
		CreateIncident: createIncident,
		Category:       category,
		Subject:        subject,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func handleAdminLogs(w http.ResponseWriter, r *http.Request) {
	if setupCORS(&w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	memLogWriter.Lock()
	logs := make([]string, len(memLogWriter.logs))
	copy(logs, memLogWriter.logs)
	memLogWriter.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(logs)
}

func loadEnv() {
	file, err := os.Open(".env")
	if err != nil {
		return // Ignorar si no existe
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			os.Setenv(key, val)
		}
	}
}

func main() {
	// Cargar variables de entorno desde .env
	loadEnv()

	// Redirigir logs para capturarlos en memoria y mostrarlos en el Admin Panel
	log.SetOutput(io.MultiWriter(os.Stdout, memLogWriter))

	// Verificar carga de API key
	bridgeKey := os.Getenv("BRIDGE_API_KEY")
	if bridgeKey != "" {
		log.Printf("🔑 [Env] BRIDGE_API_KEY cargada con éxito (longitud: %d)", len(bridgeKey))
	} else {
		log.Println("⚠️ [Env] Advertencia: BRIDGE_API_KEY no encontrada en .env")
	}

	// Inicializar la semilla aleatoria
	rand.Seed(time.Now().UnixNano())

	// Registro de manejadores
	http.HandleFunc("/api/config", handleConfig)
	http.HandleFunc("/api/auth/send-otp", handleSendOTP)
	http.HandleFunc("/api/auth/verify-otp", handleVerifyOTP)
	http.HandleFunc("/api/wallet/balance", sessionMiddleware(handleGetBalance))
	http.HandleFunc("/api/wallet/transactions", sessionMiddleware(handleGetTransactions))
	http.HandleFunc("/api/wallet/preload", sessionMiddleware(handlePreload))
	http.HandleFunc("/api/wallet/checkout", sessionMiddleware(handleCheckout))
	http.HandleFunc("/api/wallet/refund", sessionMiddleware(handleRefund))
	http.HandleFunc("/api/wallet/kyc", sessionMiddleware(handleUpdateKYC))
	http.HandleFunc("/api/admin/stats", adminMiddleware(handleAdminStats))
	http.HandleFunc("/api/admin/preloads", adminMiddleware(handleAdminPreloads))
	http.HandleFunc("/api/admin/incidents", adminMiddleware(handleAdminIncidents))
	http.HandleFunc("/api/admin/incidents/create", adminMiddleware(handleAdminCreateIncident))
	http.HandleFunc("/api/admin/incidents/resolve", adminMiddleware(handleAdminResolveIncident))
	http.HandleFunc("/api/admin/downloads", adminMiddleware(handleAdminDownloads))
	http.HandleFunc("/api/admin/downloads/click", adminMiddleware(handleAdminDownloadClick))
	http.HandleFunc("/api/admin/simulate", adminMiddleware(handleAdminSimulate))
	http.HandleFunc("/api/admin/health", adminMiddleware(handleAdminHealth))
	http.HandleFunc("/api/admin/simulate-incident", adminMiddleware(handleAdminSimulateIncident))
	http.HandleFunc("/api/admin/logs", adminMiddleware(handleAdminLogs))
	http.HandleFunc("/api/support/chat", handleSupportChat)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	fmt.Printf("🚀 Servidor Backend Go escuchando en http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

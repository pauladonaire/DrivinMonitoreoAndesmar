/* ============================================================
   config.js — Constantes globales de la aplicación
   ============================================================ */

const API_KEY          = '69191355-f4d1-40e4-bc2f-087b4451f59d';
const PODS_ENDPOINT    = 'https://external.driv.in/api/external/v2/pods';
const PODS_V3_ENDPOINT = 'https://external.driv.in/api/external/v3/pods';
const USERS_ENDPOINT   = 'https://external.driv.in/api/external/v2/users?role_name=driver';
const EMAIL_DESTINO    = 'pauladonaire@andesmar.com.ar';

// ============================================================
// Configuración EmailJS
// 1. Crear cuenta en https://www.emailjs.com (plan Free — 200 emails/mes)
// 2. Add New Service → conectar email → copiar Service ID
// 3. Email Templates → New Template → variables:
//    {{date}}, {{total_orders}}, {{total_delivered}}, {{total_rejected}},
//    {{effectiveness}}, {{top_reasons}}, {{closed_at}}
// 4. Account → copiar Public Key
// 5. Pegar los tres valores abajo:
// ============================================================
const EMAILJS_SERVICE_ID  = 'service_21rirpz';
const EMAILJS_TEMPLATE_ID = 'template_c3bxv5v';
const EMAILJS_PUBLIC_KEY  = 'Uh_jBG6KmjR_F6xuF';

// Google Apps Script Web App — maneja emails, Sheets y cierre automático
// Redeploy en script.google.com si el código GAS cambia (misma URL)
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycby0MDTJ9-Hvqww_Ze4ILTHUlAYzmc5RUo5UZ8pSnvBUDit1tMGxMFVF3xvyplNOO7h37A/exec';

const REFRESH_INTERVAL_MS = 300000; // 5 minutos
const PAGE_SIZE           = 20;

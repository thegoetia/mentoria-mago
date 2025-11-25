// supabase.js
// Inicializa o cliente do Supabase

const SUPABASE_URL = "https://xjmmgvbzfsgjltzggysv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqbW1ndmJ6ZnNnamx0emdneXN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwOTI3MDAsImV4cCI6MjA3OTY2ODcwMH0.UpJk8za096938yDfFXiLaFF7fYdZfuKA5v1Wo4xSYG4";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Exporte para usar globalmente
window.supabaseClient = _supabase;

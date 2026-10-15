import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qhddnctmqaaxthprexiw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZGRuY3RtcWFheHRocHJleGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTMwODksImV4cCI6MjA5NTI4OTA4OX0.uIcyKH4axg3hJ_roK3xSckse71kikM23ANffoLBJsRI';

export const supabase = createClient(supabaseUrl, supabaseKey);
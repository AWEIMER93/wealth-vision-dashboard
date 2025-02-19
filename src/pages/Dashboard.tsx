
import { useAuth } from '@/providers/AuthProvider';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Apple, Car, Monitor, Globe2, Cpu, Mon
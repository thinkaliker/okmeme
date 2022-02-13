import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../utils/initSupabase'

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  supabase.auth.api.setAuthCookie(req, res)
};

export default handler;
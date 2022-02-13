import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../utils/initSupabase'

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  // console.log('-------', req.body.event, req.body.session)
  console.log('request received', req.body.event)
  supabase.auth.api.setAuthCookie(req, res)
};

export default handler;
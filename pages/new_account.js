import Link from 'next/link'
import useSWR from 'swr'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../utils/initSupabase'
import Auth from '../components/Auth'
import { useUser } from '../lib/UserContext'

const fetcher = (url, token) =>
  fetch(url, {
    method: 'GET',
    headers: new Headers({ 'Content-Type': 'application/json', token }),
    credentials: 'same-origin',
  }).then((res) => res.json())

  const Login = () => {
    const { user, session } = useUser()
    const { data, error } = useSWR(session ? ['/api/getUser', session.access_token] : null, fetcher)
    const [authView, setAuthView] = useState('sign_up')

    const router = useRouter();
    const { email } = router.query
  
    useEffect(() => {
      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') setAuthView('update_password')
        if (event === 'USER_UPDATED') setTimeout(() => setAuthView('sign_in'), 1000)
        // Send session to /api/auth route to set the auth cookie.
        // NOTE: this is only needed if you're doing SSR (getServerSideProps)!
        fetch('/api/auth', {
          method: 'POST',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          credentials: 'same-origin',
          body: JSON.stringify({ event, session }),
        }).then((res) => res.json())
      })
  
      return () => {
        authListener.unsubscribe()
      }
    }, [])
  
    const View = () => {
      if (!user)
        return (
          <>
            <div>
              <img src="/okmeme.png" width="96" />
              <h2>
                OKMEME Signup
              </h2>
            </div>
            <Auth providedEmail={email} supabaseClient={supabase} authView={authView} setAuthView={setAuthView} />
          </>
        )
  
      return (
        <>
          {authView === 'update_password' && <Auth.UpdatePassword supabaseClient={supabase} />}
          {user && (
            <>
              <h4>You're signed in</h4>
              <h5>Email: {user.email}</h5>
  
              <button type="outline" onClick={() => supabase.auth.signOut()}>
                Log out
              </button>
              <hr />
              {error && <div style={{ color: 'red' }}>Failed to fetch user!</div>}
              {data && !error ? (
                <>
                  <div style={{ color: 'green' }}>
                    User data retrieved server-side (in API route):
                  </div>
  
                  <pre>{JSON.stringify(data, null, 2)}</pre>
                </>
              ) : (
                <div>Loading...</div>
              )}
  
            </>
          )}
        </>
      )
    }
  
    return (
      <div style={{ maxWidth: '520px', margin: '96px auto' }}>
        <View />
      </div>
    )
  }
  
  export default Login
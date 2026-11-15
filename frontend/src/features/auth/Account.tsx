import {useEffect, useState, type FormEvent} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {api} from '../../api'
import {Pigeon} from '../../components/Brand'
import {Status} from '../../components/Status'

export function Account({user,request}: {user?: {email:string};request:number}) {
  const cache=useQueryClient()
  const [open,setOpen]=useState(false), [register,setRegister]=useState(false)
  const [busy,setBusy]=useState(false), [error,setError]=useState<Error|null>(null)
  const [profile,setProfile]=useState(false)
  useEffect(()=>{if(request) setOpen(true)},[request])
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form=new FormData(e.currentTarget)
    setBusy(true);setError(null)
    try {
      const value=await api<{email:string}>(register?'/auth/register':'/auth/login','POST',{
        email:form.get('email'),password:form.get('password'),
      })
      cache.setQueryData(['me'],value)
      setOpen(false)
    } catch(e) {setError(e as Error)} finally {setBusy(false)}
  }
  async function logout() {
    setError(null)
    try {
      await api('/auth/logout','POST')
      cache.removeQueries({queryKey:['scenarios']})
      cache.setQueryData(['me'],null)
    } catch(e) {setError(e as Error)}
  }
  return <div className="account">{user ? <><button onClick={()=>setProfile(!profile)} aria-expanded={profile}>Мой профиль</button>{profile&&<span>{user.email}</span>}<button onClick={logout}>Выйти</button></> :
    <button onClick={()=>{setOpen(!open);setError(null)}} aria-expanded={open}>Войти</button>}
    {open && !user && <form className="panel popover" onSubmit={submit} aria-label="Аккаунт GOLUBKA AVIA" onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}}>
      <div className="account-brand"><Pigeon pose="analytics"/><span>GOLUBKA AVIA</span><button className="account-close" type="button" aria-label="Закрыть окно входа" onClick={()=>setOpen(false)}>×</button></div>
      <h2>{register?'Создать аккаунт':'Вход в аккаунт'}</h2>
      <label>Email<input name="email" type="email" autoFocus required autoComplete="email"/></label>
      <label>Пароль<input name="password" type="password" required minLength={8} maxLength={128} autoComplete={register?'new-password':'current-password'}/></label>
      <Status error={error}/><button className="primary" disabled={busy}>{register?'Зарегистрироваться':'Войти в аккаунт'}</button>
      <button type="button" onClick={()=>{setRegister(!register);setError(null)}}>{register?'Уже есть аккаунт':'Зарегистрироваться'}</button>
    </form>}{user && <Status error={error}/>}</div>
}

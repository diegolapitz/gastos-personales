import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api'

const VistaCtx = createContext({ vista: 'liquidez', setVista: () => {} })

export function VistaProvider({ children }) {
  const [vista, setVistaLocal] = useState('liquidez')

  useEffect(() => {
    api.getConfig().then(c => {
      if (c.vista_gastos) setVistaLocal(c.vista_gastos)
    }).catch(() => {})
  }, [])

  function setVista(v) {
    setVistaLocal(v)
    api.setVista(v).catch(() => {})
  }

  return <VistaCtx.Provider value={{ vista, setVista }}>{children}</VistaCtx.Provider>
}

export function useVista() {
  return useContext(VistaCtx)
}

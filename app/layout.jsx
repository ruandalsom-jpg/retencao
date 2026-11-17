import './globals.css'
import { TemaProvider } from './tema'

export const metadata = { title: 'Retenção de Frota' }

export default function Layout({ children }) {
  return <html lang="pt-BR" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:"try{document.documentElement.dataset.tema=localStorage.getItem('retencao-tema')==='escuro'?'escuro':'claro'}catch(e){}"}}/></head><body><TemaProvider>{children}</TemaProvider></body></html>
}

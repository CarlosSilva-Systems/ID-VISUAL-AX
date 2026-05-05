import { User } from "../app/types";

export const canAccessRoute = (user: User | null, path: string): boolean => {
  if (!user) return false;
  
  const role = (user.role || "operator").toLowerCase();
  const isTI = role === "ti" || role === "admin" || user.is_admin;
  
  if (isTI) return true;

  if (role === "producao") {
    return [
      "/id-visual/producao",
      "/andon/painel",
      "/andon/pendencias",
      "/andon-tv"
    ].includes(path);
  }

  if (role === "engenharia") {
    // Acesso a ID Visual exceto indicadores
    if (path === "/id-visual/analytics") return false;
    if (path.startsWith("/id-visual")) return true;
    return false;
  }

  if (role === "gerencia") {
    // Acesso a tudo, menos "Padrões (5S)" e "Dispositivos IoT"
    // Liberamos /admin para que a gerência possa gerenciar usuários locais
    const forbidden = ["/templates", "/andon/devices"];
    return !forbidden.some(f => path.startsWith(f));
  }

  // operator ou responsible default (mantemos o acesso aberto por compatibilidade legada)
  return true;
};

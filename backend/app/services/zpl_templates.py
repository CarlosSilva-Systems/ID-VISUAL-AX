"""
Templates ZPL para impressão de etiquetas via impressoras Zebra.

Funções puras — sem I/O, apenas geração de strings ZPL.

Especificações:
    - Etiqueta técnica interna: 100x45mm, 203dpi → ^PW800 ^LL360
    - Etiqueta externa com QR code: 100x55mm, 203dpi → ^PW800 ^LL440
"""


def render_technical_label(
    nome_obra: str,
    nome_quadro: str,
    corrente_nominal: str,
    frequencia: str,
    cap_corte: str,
    tensao: str,
    curva_disparo: str,
    tensao_impulso: str,
    tensao_isolamento: str,
) -> str:
    """
    Gera ZPL para etiqueta técnica interna (100x45mm, 203dpi).

    Layout:
        - Borda externa
        - Cabeçalho: logo AX/AUTOMAÇÃO | separador | nome da obra + nome do quadro
        - Linha divisória horizontal
        - 5 linhas de dados técnicos com células delimitadas por ^GB

    Args:
        nome_obra: Nome do empreendimento/obra.
        nome_quadro: Nome do quadro elétrico.
        corrente_nominal: Valor de corrente nominal (ex: "25A").
        frequencia: Frequência (ex: "60Hz").
        cap_corte: Capacidade de corte Icu (ex: "10kA").
        tensao: Tensão nominal (ex: "220V").
        curva_disparo: Corrente de disparo magnético (ex: "10x In").
        tensao_impulso: Tensão de impulso suportável Uimp (ex: "4kV").
        tensao_isolamento: Tensão nominal de isolamento Ui (ex: "500V").

    Returns:
        str: Payload ZPL completo pronto para envio à impressora.
    """
    # Sanitiza entradas — evita quebra de ZPL com caracteres especiais
    def _s(val: str) -> str:
        return (val or "").replace("^", "").replace("~", "").strip()

    nome_obra = _s(nome_obra)
    nome_quadro = _s(nome_quadro)
    corrente_nominal = _s(corrente_nominal)
    frequencia = _s(frequencia)
    cap_corte = _s(cap_corte)
    tensao = _s(tensao)
    curva_disparo = _s(curva_disparo)
    tensao_impulso = _s(tensao_impulso)
    tensao_isolamento = _s(tensao_isolamento)

    # Dimensões: 100x45mm @ 203dpi → 800x360 dots
    # Cabeçalho: altura 76 dots
    # Logo block: 112 dots de largura
    # Separador vertical: x=115
    # Área de texto do cabeçalho: x=125 até x=794
    # Linha divisória: y=79
    # Dados técnicos: y=82 em diante, altura de cada linha ~55 dots
    # Metade da largura útil: ~400 dots (x=3 até x=794 → 791 dots úteis)

    HEADER_H = 76       # altura do bloco de cabeçalho
    DIV_Y = 79          # y da linha divisória horizontal
    DATA_Y = 82         # y de início dos dados técnicos
    ROW_H = 55          # altura de cada linha de dados
    FULL_W = 791        # largura útil (3 a 794)
    HALF_W = 394        # metade da largura útil (para células duplas)
    X0 = 3              # x inicial da borda

    # Posições das 5 linhas de dados
    r1y = DATA_Y
    r2y = r1y + ROW_H
    r3y = r2y + ROW_H
    r4y = r3y + ROW_H
    r5y = r4y + ROW_H

    zpl = (
        "^XA\n"
        "^PW800\n"
        "^LL360\n"
        "^CI28\n"  # UTF-8

        # --- Borda externa ---
        f"^FO{X0},{X0}^GB794,354,3^FS\n"

        # --- Cabeçalho: logo AX AUTOMAÇÃO (bloco 112x76) ---
        f"^FO8,6^GB112,{HEADER_H},2^FS\n"
        "^FO14,10^A0N,28,28^FH^FDAXn^FS\n"
        "^FO10,42^A0N,20,20^FH^FDAUTOMAÇÃO^FS\n"

        # --- Separador vertical do cabeçalho ---
        f"^FO115,{X0}^GB2,{HEADER_H + 2},2^FS\n"

        # --- Nome da obra e do quadro ---
        f"^FO122,8^A0N,30,30^FH^FD{nome_obra}^FS\n"
        f"^FO122,44^A0N,26,26^FH^FD{nome_quadro}^FS\n"

        # --- Linha divisória horizontal ---
        f"^FO{X0},{DIV_Y}^GB{FULL_W},2,2^FS\n"

        # --- Linha 1: CORRENTE NOMINAL | FREQUÊNCIA (2 células) ---
        f"^FO{X0},{r1y}^GB{HALF_W},{ROW_H},1^FS\n"
        f"^FO{X0 + HALF_W},{r1y}^GB{FULL_W - HALF_W},{ROW_H},1^FS\n"
        f"^FO8,{r1y + 4}^A0N,16,16^FDCORRENTE NOMINAL (In):^FS\n"
        f"^FO8,{r1y + 24}^A0N,22,22^FH^FD{corrente_nominal}^FS\n"
        f"^FO{X0 + HALF_W + 6},{r1y + 4}^A0N,16,16^FDFREQUÊNCIA:^FS\n"
        f"^FO{X0 + HALF_W + 6},{r1y + 24}^A0N,22,22^FH^FD{frequencia}^FS\n"

        # --- Linha 2: CAP. DE CORTE | TENSÃO (2 células) ---
        f"^FO{X0},{r2y}^GB{HALF_W},{ROW_H},1^FS\n"
        f"^FO{X0 + HALF_W},{r2y}^GB{FULL_W - HALF_W},{ROW_H},1^FS\n"
        f"^FO8,{r2y + 4}^A0N,16,16^FDCAP. DE CORTE (Icu):^FS\n"
        f"^FO8,{r2y + 24}^A0N,22,22^FH^FD{cap_corte}^FS\n"
        f"^FO{X0 + HALF_W + 6},{r2y + 4}^A0N,16,16^FDTENSÃO:^FS\n"
        f"^FO{X0 + HALF_W + 6},{r2y + 24}^A0N,22,22^FH^FD{tensao}^FS\n"

        # --- Linha 3: CORRENTE DE DISPARO MAGNÉTICO (largura total) ---
        f"^FO{X0},{r3y}^GB{FULL_W},{ROW_H},1^FS\n"
        f"^FO8,{r3y + 4}^A0N,16,16^FDCORRENTE DE DISPARO MAGNÉTICO:^FS\n"
        f"^FO8,{r3y + 24}^A0N,22,22^FH^FD{curva_disparo}^FS\n"

        # --- Linha 4: TENSÃO DE IMPULSO SUPORTÁVEL (largura total) ---
        f"^FO{X0},{r4y}^GB{FULL_W},{ROW_H},1^FS\n"
        f"^FO8,{r4y + 4}^A0N,16,16^FDTENSÃO DE IMPULSO SUPORTÁVEL (Uimp):^FS\n"
        f"^FO8,{r4y + 24}^A0N,22,22^FH^FD{tensao_impulso}^FS\n"

        # --- Linha 5: TENSÃO NOMINAL DE ISOLAMENTO (largura total) ---
        f"^FO{X0},{r5y}^GB{FULL_W},{ROW_H},1^FS\n"
        f"^FO8,{r5y + 4}^A0N,16,16^FDTENSÃO NOMINAL DE ISOLAMENTO (Ui):^FS\n"
        f"^FO8,{r5y + 24}^A0N,22,22^FH^FD{tensao_isolamento}^FS\n"

        "^XZ\n"
    )

    return zpl


def render_external_label(
    ax_code: str,
    fab_code: str,
    nome_quadro: str,
    nome_obra: str,
    qr_url: str,
) -> str:
    """
    Gera ZPL para etiqueta externa com QR code (100x55mm, 203dpi).

    Layout:
        - Borda externa
        - Canto superior direito: ax_code e fab_code empilhados
        - QR code à esquerda (~200x200 dots, módulo 8)
        - Lado direito do QR: rótulo "EQUIPAMENTO:" + nome do quadro
        - Abaixo do QR: rótulo "EMPREENDIMENTO:" + nome da obra
        - Rodapé: "Baixe seu projeto!"

    Args:
        ax_code: Código AX do produto (ex: "AX0003578").
        fab_code: Código de fabricação (ex: "FAB01015").
        nome_quadro: Nome do quadro elétrico.
        nome_obra: Nome do empreendimento/obra.
        qr_url: URL completa para o QR code.

    Returns:
        str: Payload ZPL completo pronto para envio à impressora.
    """
    def _s(val: str) -> str:
        return (val or "").replace("^", "").replace("~", "").strip()

    ax_code = _s(ax_code)
    fab_code = _s(fab_code)
    nome_quadro = _s(nome_quadro)
    nome_obra = _s(nome_obra)
    # URL: apenas sanitiza caracteres de controle ZPL
    qr_url = (qr_url or "").replace("^", "").replace("~", "").strip()

    # Dimensões: 100x55mm @ 203dpi → 800x440 dots
    # QR code: módulo 8 → ~200x200 dots, posicionado em x=18, y=28
    # Área de texto direita: x=230 em diante
    # Rodapé: y=400

    zpl = (
        "^XA\n"
        "^PW800\n"
        "^LL440\n"
        "^CI28\n"  # UTF-8

        # --- Borda externa ---
        "^FO3,3^GB794,434,3^FS\n"

        # --- Canto superior direito: ax_code e fab_code ---
        f"^FO560,8^A0N,26,26^FH^FD{ax_code}^FS\n"
        f"^FO560,38^A0N,26,26^FH^FD{fab_code}^FS\n"

        # --- QR code à esquerda ---
        f"^FO18,28^BQN,2,8^FDQA,{qr_url}^FS\n"

        # --- Lado direito do QR: EQUIPAMENTO ---
        "^FO230,30^A0N,20,20^FDEQUIPAMENTO:^FS\n"
        f"^FO230,56^A0N,36,36^FH^FD{nome_quadro}^FS\n"

        # --- Abaixo: EMPREENDIMENTO ---
        "^FO230,110^A0N,20,20^FDEMPREENDIMENTO:^FS\n"
        f"^FO230,136^A0N,30,30^FH^FD{nome_obra}^FS\n"

        # --- Rodapé ---
        "^FO18,400^A0N,22,22^FDBaixe seu projeto!^FS\n"

        "^XZ\n"
    )

    return zpl

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


# ---------------------------------------------------------------------------
# WAGO 210-805 — Etiqueta de dispositivo (régua de componentes)
# ---------------------------------------------------------------------------

_DEVICE_BATCH = 20   # máximo de etiquetas por job ZPL
_CELL_W = 136        # largura da célula: 17mm × 8 dots/mm = 136 dots
_CELL_H = 44         # altura da célula: 5.5mm × 8 dots/mm = 44 dots


def render_device_labels(devices: list[dict]) -> list[str]:
    """
    Gera ZPL para etiquetas de dispositivo WAGO 210-805 (régua de componentes).

    Cada etiqueta: 17mm × 5.5mm (136 × 44 dots).
    Um único job imprime toda a régua em sequência vertical.
    Listas com mais de 20 dispositivos são divididas em múltiplos jobs.

    Args:
        devices: Lista de dicts com chaves 'device_tag' e 'description'.

    Returns:
        list[str]: Lista de payloads ZPL, um por job (máx. 20 etiquetas cada).
    """
    def _s(val: str) -> str:
        return (val or "").replace("^", "").replace("~", "").strip()

    if not devices:
        return []

    jobs: list[str] = []

    for batch_start in range(0, len(devices), _DEVICE_BATCH):
        batch = devices[batch_start: batch_start + _DEVICE_BATCH]
        total_h = _CELL_H * len(batch)

        lines = [
            "^XA\n",
            f"^PW{_CELL_W}\n",
            f"^LL{total_h}\n",
            "^CI28\n",
        ]

        for i, dev in enumerate(batch):
            tag  = _s(dev.get("device_tag", ""))
            desc = _s(dev.get("description", ""))
            y0 = i * _CELL_H

            # Separador horizontal superior (exceto na primeira célula)
            if i > 0:
                lines.append(f"^FO0,{y0}^GB{_CELL_W},1,1^FS\n")

            # device_tag centralizado (linha superior da célula)
            lines.append(f"^FO2,{y0 + 2}^A0N,20,18^FH^FD{tag}^FS\n")

            # description abaixo em fonte menor
            lines.append(f"^FO2,{y0 + 24}^A0N,14,12^FH^FD{desc}^FS\n")

        lines.append("^XZ\n")
        jobs.append("".join(lines))

    return jobs


# ---------------------------------------------------------------------------
# WAGO 210-855 — Etiqueta de porta (painel de botões)
# ---------------------------------------------------------------------------

def render_door_label(equipment_name: str, columns: list[str]) -> str:
    """
    Gera ZPL para etiqueta de porta WAGO 210-855.

    Dimensão: 72mm × 24mm = 576 × 192 dots @ 203dpi.
    Layout:
        - Borda externa
        - Linha superior (80 dots): equipment_name centralizado
        - Separador horizontal em y=82
        - Linha inferior dividida em N colunas iguais com texto centralizado

    Args:
        equipment_name: Nome do equipamento (ex: "Bomba 1").
        columns: Lista de descrições de cada posição (ex: ["Automático", "Manual"]).

    Returns:
        str: Payload ZPL completo.
    """
    def _s(val: str) -> str:
        return (val or "").replace("^", "").replace("~", "").strip()

    equipment_name = _s(equipment_name)
    cols = [_s(c) for c in (columns or [])]
    n = max(len(cols), 1)

    PW = 576
    LL = 192
    SEP_Y = 82          # y do separador horizontal
    COL_W = PW // n     # largura de cada coluna (inteiro)
    COL_AREA_H = LL - SEP_Y - 2  # altura disponível para as colunas

    # Centro vertical da área de colunas para o texto
    col_text_y = SEP_Y + (COL_AREA_H - 22) // 2

    lines = [
        "^XA\n",
        f"^PW{PW}\n",
        f"^LL{LL}\n",
        "^CI28\n",
        # Borda externa
        "^FO2,2^GB572,188,2^FS\n",
        # equipment_name centralizado na linha superior
        f"^FO0,20^A0N,40,34^FB{PW},1,,C^FH^FD{equipment_name}^FS\n",
        # Separador horizontal
        f"^FO2,{SEP_Y}^GB572,1,1^FS\n",
    ]

    for i, col_text in enumerate(cols):
        x0 = i * COL_W

        # Separador vertical à esquerda de cada coluna (exceto a primeira)
        if i > 0:
            lines.append(f"^FO{x0},{SEP_Y}^GB1,{COL_AREA_H},1^FS\n")

        # Texto centralizado horizontalmente na célula
        lines.append(
            f"^FO{x0},{col_text_y}^A0N,22,18^FB{COL_W},1,,C^FH^FD{col_text}^FS\n"
        )

    lines.append("^XZ\n")
    return "".join(lines)


# ---------------------------------------------------------------------------
# WAGO 2009-110 — Marcador de borne
# ---------------------------------------------------------------------------

_TERMINAL_BATCH = 50  # máximo de marcadores por job ZPL
_TERM_W = 48          # largura: 6mm × 8 dots/mm = 48 dots
_TERM_H = 48          # altura: 6mm × 8 dots/mm = 48 dots


def render_terminal_labels(terminals: list[dict]) -> list[str]:
    """
    Gera ZPL para marcadores de borne WAGO 2009-110.

    Cada marcador: 6mm × 6mm (48 × 48 dots).
    Impressão contínua — sem espaço entre marcadores.
    Listas com mais de 50 bornes são divididas em múltiplos jobs.

    Args:
        terminals: Lista de dicts com chaves 'terminal_number', 'wire_number' (opt),
                   'group_name' (opt).

    Returns:
        list[str]: Lista de payloads ZPL, um por job (máx. 50 marcadores cada).
    """
    def _s(val: str) -> str:
        return (val or "").replace("^", "").replace("~", "").strip()

    if not terminals:
        return []

    jobs: list[str] = []

    for batch_start in range(0, len(terminals), _TERMINAL_BATCH):
        batch = terminals[batch_start: batch_start + _TERMINAL_BATCH]
        total_h = _TERM_H * len(batch)

        lines = [
            "^XA\n",
            f"^PW{_TERM_W}\n",
            f"^LL{total_h}\n",
            "^CI28\n",
        ]

        for i, term in enumerate(batch):
            num  = _s(term.get("terminal_number", ""))
            wire = _s(term.get("wire_number", ""))
            y0 = i * _TERM_H

            # terminal_number em destaque (centralizado)
            lines.append(
                f"^FO0,{y0 + 4}^A0N,28,24^FB{_TERM_W},1,,C^FH^FD{num}^FS\n"
            )

            # wire_number abaixo em fonte menor, se existir
            if wire:
                lines.append(
                    f"^FO0,{y0 + 32}^A0N,14,12^FB{_TERM_W},1,,C^FH^FD{wire}^FS\n"
                )

        lines.append("^XZ\n")
        jobs.append("".join(lines))

    return jobs


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

def render_label(label_type: str, data: dict) -> str | list[str]:
    """
    Dispatcher de templates ZPL por tipo de etiqueta.

    Tipos suportados:
        "technical" → render_technical_label(**data)          → str
        "external"  → render_external_label(**data)           → str
        "device"    → render_device_labels(data["devices"])   → list[str]
        "door"      → render_door_label(...)                  → str
        "terminal"  → render_terminal_labels(data["terminals"])→ list[str]
        "both"      → technical + external concatenados       → str

    Args:
        label_type: Tipo de etiqueta.
        data: Dicionário com os parâmetros necessários para o template.

    Returns:
        str ou list[str] dependendo do tipo.

    Raises:
        ValueError: Se label_type não for reconhecido.
    """
    if label_type == "technical":
        return render_technical_label(**data)

    if label_type == "external":
        return render_external_label(**data)

    if label_type == "both":
        return render_technical_label(**data) + "\n" + render_external_label(**data)

    if label_type == "device":
        return render_device_labels(data["devices"])

    if label_type == "door":
        return render_door_label(
            equipment_name=data["equipment_name"],
            columns=data["columns"],
        )

    if label_type == "terminal":
        return render_terminal_labels(data["terminals"])

    raise ValueError(f"Tipo de etiqueta desconhecido: {label_type!r}")

#!/usr/bin/env python3
"""
Seed: Configurações da impressora Zebra em SystemSetting.

Insere (ou atualiza) as chaves necessárias para o módulo de impressão de etiquetas.
Operação idempotente — seguro para executar múltiplas vezes.

Chaves inseridas:
    zebra_printer_ip    → IP da impressora (vazio por padrão — requer configuração manual)
    zebra_printer_port  → Porta TCP RAW (padrão: 9100)

Uso:
    python backend/scripts/seed_printer_settings.py
    python backend/scripts/seed_printer_settings.py --ip 192.168.1.100
    python backend/scripts/seed_printer_settings.py --dry-run
"""

import asyncio
import sys
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import AsyncSession as SAAsyncSession

from app.db.session import async_engine
from app.models.system_setting import SystemSetting


PRINTER_SETTINGS: list[dict] = [
    {
        "key": "zebra_printer_ip",
        "value": "",
        "description": (
            "Endereço IP da impressora Zebra (ex: 192.168.1.100). "
            "Deixar vazio desabilita a impressão. "
            "Configure via Settings ou diretamente no banco."
        ),
    },
    {
        "key": "zebra_printer_port",
        "value": "9100",
        "description": (
            "Porta TCP da impressora Zebra para protocolo RAW/ZPL. "
            "Padrão Zebra: 9100. Alterar apenas se a impressora usar porta customizada."
        ),
    },
]


async def upsert_setting(
    session: SAAsyncSession,
    key: str,
    value: str,
    description: str,
    dry_run: bool,
) -> str:
    """
    Insere ou atualiza um SystemSetting.

    Returns:
        "created" | "updated" | "skipped" (dry_run)
    """
    stmt = select(SystemSetting).where(SystemSetting.key == key)
    result = await session.execute(stmt)
    existing = result.scalars().first()

    if dry_run:
        action = "would update" if existing else "would create"
        print(f"  [dry-run] {action}: key={key!r}  value={value!r}")
        return "skipped"

    if existing:
        existing.value = value
        existing.description = description
        session.add(existing)
        return "updated"
    else:
        session.add(SystemSetting(key=key, value=value, description=description))
        return "created"


async def seed(printer_ip: str = "", dry_run: bool = False) -> None:
    """
    Executa o seed das configurações da impressora Zebra.

    Args:
        printer_ip: IP da impressora (sobrescreve o padrão vazio se fornecido)
        dry_run: Se True, apenas simula sem persistir
    """
    settings_to_seed = [
        {**s, "value": printer_ip if s["key"] == "zebra_printer_ip" and printer_ip else s["value"]}
        for s in PRINTER_SETTINGS
    ]

    print("=" * 55)
    print("  Seed: Configurações da Impressora Zebra")
    print("=" * 55)

    async with SAAsyncSession(async_engine) as session:
        counts = {"created": 0, "updated": 0, "skipped": 0}

        for setting in settings_to_seed:
            action = await upsert_setting(
                session=session,
                key=setting["key"],
                value=setting["value"],
                description=setting["description"],
                dry_run=dry_run,
            )
            counts[action] += 1

            if not dry_run:
                status = "✓ criado" if action == "created" else "↺ atualizado"
                print(f"  {status}: {setting['key']!r} = {setting['value']!r}")

        if not dry_run:
            await session.commit()
            print()
            print(f"  Resultado: {counts['created']} criado(s), {counts['updated']} atualizado(s)")

            if not printer_ip:
                print()
                print("  ⚠  zebra_printer_ip está vazio.")
                print("     Configure o IP via Settings ou execute:")
                print("     python scripts/seed_printer_settings.py --ip <IP>")
        else:
            print()
            print("  [dry-run] Nenhuma alteração foi persistida.")

    print("=" * 55)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed das configurações da impressora Zebra em SystemSetting."
    )
    parser.add_argument(
        "--ip",
        default="",
        metavar="IP",
        help="IP da impressora Zebra (ex: 192.168.1.100). Padrão: vazio.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simula a operação sem persistir no banco.",
    )
    args = parser.parse_args()

    asyncio.run(seed(printer_ip=args.ip, dry_run=args.dry_run))


if __name__ == "__main__":
    main()

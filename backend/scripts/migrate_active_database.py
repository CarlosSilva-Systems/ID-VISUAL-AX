#!/usr/bin/env python3
"""
Script de Migração: Popular system_setting com active_odoo_db

Este script popula a tabela system_setting com o banco de dados Odoo ativo padrão.
Deve ser executado após atualizar para a versão 2.0.0.

Uso:
    python backend/scripts/migrate_active_database.py

Opções:
    --database <nome>  : Especifica o banco de dados ativo (padrão: id-visual-3)
    --rollback         : Remove a configuração (rollback)
    --dry-run          : Simula a operação sem persistir
"""

import asyncio
import sys
import argparse
from pathlib import Path

# Adicionar diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from datetime import datetime

from app.db.session import async_engine
from app.models.system_setting import SystemSetting


async def migrate_active_database(database_name: str, dry_run: bool = False):
    """
    Popula system_setting com active_odoo_db.
    
    Args:
        database_name: Nome do banco de dados ativo
        dry_run: Se True, apenas simula a operação
    """
    print(f"🔄 Iniciando migração de active_odoo_db...")
    print(f"   Banco de dados: {database_name}")
    print(f"   Modo: {'DRY-RUN (simulação)' if dry_run else 'PRODUÇÃO'}")
    print()
    
    async with AsyncSession(async_engine) as session:
        try:
            # Verificar se já existe
            stmt = select(SystemSetting).where(SystemSetting.key == "active_odoo_db")
            result = await session.execute(stmt)
            existing = result.scalars().first()
            
            if existing:
                print(f"⚠️  Configuração já existe:")
                print(f"   Chave: {existing.key}")
                print(f"   Valor atual: {existing.value}")
                print(f"   Última atualização: {existing.updated_at}")
                print()
                
                if existing.value == database_name:
                    print("✅ Valor já está correto. Nenhuma ação necessária.")
                    return True
                
                print(f"🔄 Atualizando valor de '{existing.value}' para '{database_name}'...")
                
                if not dry_run:
                    existing.value = database_name
                    existing.updated_at = datetime.utcnow()
                    session.add(existing)
                    await session.commit()
                    print("✅ Valor atualizado com sucesso!")
                else:
                    print("✅ [DRY-RUN] Valor seria atualizado.")
            else:
                print(f"➕ Criando nova configuração...")
                
                if not dry_run:
                    setting = SystemSetting(
                        key="active_odoo_db",
                        value=database_name,
                        description="Banco de dados Odoo ativo selecionado dinamicamente",
                        updated_at=datetime.utcnow()
                    )
                    session.add(setting)
                    await session.commit()
                    print("✅ Configuração criada com sucesso!")
                else:
                    print("✅ [DRY-RUN] Configuração seria criada.")
            
            print()
            print("📊 Estado final:")
            
            # Verificar estado final
            stmt = select(SystemSetting).where(SystemSetting.key == "active_odoo_db")
            result = await session.execute(stmt)
            final = result.scalars().first()
            
            if final:
                print(f"   Chave: {final.key}")
                print(f"   Valor: {final.value}")
                print(f"   Descrição: {final.description}")
                print(f"   Última atualização: {final.updated_at}")
            else:
                print("   [Nenhuma configuração encontrada]")
            
            return True
            
        except Exception as e:
            print(f"❌ Erro durante migração: {e}")
            await session.rollback()
            return False


async def rollback_migration(dry_run: bool = False):
    """
    Remove a configuração active_odoo_db (rollback).
    
    Args:
        dry_run: Se True, apenas simula a operação
    """
    print(f"🔄 Iniciando rollback de active_odoo_db...")
    print(f"   Modo: {'DRY-RUN (simulação)' if dry_run else 'PRODUÇÃO'}")
    print()
    
    async with AsyncSession(async_engine) as session:
        try:
            # Buscar configuração
            stmt = select(SystemSetting).where(SystemSetting.key == "active_odoo_db")
            result = await session.execute(stmt)
            existing = result.scalars().first()
            
            if not existing:
                print("⚠️  Configuração não encontrada. Nenhuma ação necessária.")
                return True
            
            print(f"🗑️  Removendo configuração:")
            print(f"   Chave: {existing.key}")
            print(f"   Valor: {existing.value}")
            print()
            
            if not dry_run:
                await session.delete(existing)
                await session.commit()
                print("✅ Configuração removida com sucesso!")
            else:
                print("✅ [DRY-RUN] Configuração seria removida.")
            
            return True
            
        except Exception as e:
            print(f"❌ Erro durante rollback: {e}")
            await session.rollback()
            return False


def main():
    parser = argparse.ArgumentParser(
        description="Script de migração para popular system_setting com active_odoo_db"
    )
    parser.add_argument(
        "--database",
        default="id-visual-3",
        help="Nome do banco de dados ativo (padrão: id-visual-3)"
    )
    parser.add_argument(
        "--rollback",
        action="store_true",
        help="Remove a configuração (rollback)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simula a operação sem persistir"
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("  Script de Migração: active_odoo_db")
    print("=" * 60)
    print()
    
    if args.rollback:
        success = asyncio.run(rollback_migration(dry_run=args.dry_run))
    else:
        success = asyncio.run(migrate_active_database(
            database_name=args.database,
            dry_run=args.dry_run
        ))
    
    print()
    print("=" * 60)
    
    if success:
        print("✅ Migração concluída com sucesso!")
        sys.exit(0)
    else:
        print("❌ Migração falhou. Verifique os logs acima.")
        sys.exit(1)


if __name__ == "__main__":
    main()

/**
 * Smoke del mini-CRM (SQLite local).
 *   npx tsx scripts/smoke-crm.ts
 */
import db from "../src/lib/db";
import { initCrmSchema } from "../src/lib/crm/schema";
import { createProspecto, deleteProspecto, listProspectos } from "../src/lib/crm/prospectos";
import {
  createProduct,
  deleteProduct,
  listPriceLists,
  upsertPriceListItem,
} from "../src/lib/crm/products";
import {
  createDeal,
  deleteDeal,
  listPipelines,
  updateDeal,
} from "../src/lib/crm/pipelines";
import { changeQuoteStatus, createQuote, requireQuote } from "../src/lib/crm/quotes";
import { lineTotal, quoteTotals } from "../src/lib/crm/quote-math";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}

function cleanup(ids: {
  quoteId?: number;
  dealId?: number;
  productId?: number;
  prospectoId?: number;
}): void {
  if (ids.quoteId) {
    db.prepare("DELETE FROM quotes WHERE id = ?").run(ids.quoteId);
  }
  if (ids.dealId) {
    try {
      deleteDeal(ids.dealId);
    } catch {
      db.prepare("DELETE FROM deals WHERE id = ?").run(ids.dealId);
    }
  }
  if (ids.productId) {
    db.prepare("DELETE FROM price_list_items WHERE product_id = ?").run(ids.productId);
    db.prepare("DELETE FROM products WHERE id = ?").run(ids.productId);
  }
  if (ids.prospectoId) {
    try {
      deleteProspecto(ids.prospectoId);
    } catch {
      db.prepare("DELETE FROM prospectos WHERE id = ?").run(ids.prospectoId);
    }
  }
}

function main(): void {
  console.log("== Smoke CRM ==\n");
  const stamp = Date.now() % 1_000_000_000;
  const phone = `55${String(10000000 + (stamp % 10_000_000)).slice(-8)}`;
  const created: {
    quoteId?: number;
    dealId?: number;
    productId?: number;
    prospectoId?: number;
  } = {};

  try {
    const pipelinesBefore = (
      db.prepare("SELECT COUNT(*) AS n FROM pipelines").get() as { n: number }
    ).n;
    initCrmSchema();
    initCrmSchema();
    const pipelinesAfter = (
      db.prepare("SELECT COUNT(*) AS n FROM pipelines").get() as { n: number }
    ).n;
    check("initCrmSchema es idempotente", pipelinesBefore === pipelinesAfter);

    const pipelines = listPipelines();
    const ventas = pipelines.find((p) => p.name === "Embudo de ventas");
    check(
      "seed embudo Ventas",
      Boolean(ventas && ventas.stages.length === 5),
    );
    check(
      "seed etapas en español",
      Boolean(ventas?.stages.some((s) => s.name === "Lead nuevo" && s.position === 0)),
    );

    const lists = listPriceLists();
    const general = lists.find((l) => l.is_default) ?? lists[0];
    check("seed lista de precios", Boolean(general && general.currency === "MXN"));

    const prospecto = createProspecto({
      name: `TEST-Prospecto ${stamp}`,
      phone: `+52 ${phone.slice(0, 2)} ${phone.slice(2, 6)} ${phone.slice(6)}`,
      email: `test-crm-${stamp}@example.com`,
      company: "TEST-Empresa",
      tags: ["test"],
    });
    created.prospectoId = prospecto.id;
    check("prospecto creado", prospecto.phone_normalized === phone);
    check(
      "listado encuentra prospecto",
      listProspectos({ search: `TEST-Prospecto ${stamp}` }).data.some((p) => p.id === prospecto.id),
    );

    const product = createProduct({
      sku: `TEST-${stamp}`,
      name: `TEST-Producto ${stamp}`,
      unit: "pza",
      status: "active",
    });
    created.productId = product.id;
    check("producto activo", product.active === true && product.status === "active");

    const list = upsertPriceListItem(general!.id, product.id, 100);
    check(
      "precio upsert",
      list.items.some((item) => item.product_id === product.id && item.unit_price === 100),
    );

    const stage = ventas!.stages[0];
    const deal = createDeal({
      pipeline_id: ventas!.id,
      stage_id: stage.id,
      prospecto_id: prospecto.id,
      title: `TEST-Deal ${stamp}`,
      value: 0,
    });
    created.dealId = deal.id;
    check("deal creado", deal.prospecto_name === prospecto.name);

    const nextStage = ventas!.stages[1];
    const moved = updateDeal(deal.id, { stage_id: nextStage.id });
    check("mover deal cambia stage_id", moved.stage_id === nextStage.id);

    const quote = createQuote({
      prospecto_id: prospecto.id,
      price_list_id: general!.id,
      deal_id: deal.id,
      currency: "MXN",
      lines: [
        {
          product_id: product.id,
          name_snapshot: product.name,
          sku_snapshot: product.sku,
          qty: 2,
          unit_price: 100,
          discount_pct: 10,
        },
      ],
    });
    created.quoteId = quote.id;
    const expectedLine = lineTotal(2, 100, 10);
    const expected = quoteTotals([{ qty: 2, unitPrice: 100, discountPct: 10 }]);
    check("quote draft", quote.status === "draft");
    check("line_total servidor", quote.lines[0]?.line_total === expectedLine);
    check("subtotal servidor", quote.subtotal === expected.subtotal);
    check("discount_total servidor", quote.discount_total === expected.discountTotal);
    check("total servidor", quote.total === expected.total);
    check("total 180", quote.total === 180);

    let blocked = false;
    try {
      deleteProduct(product.id);
    } catch {
      blocked = true;
    }
    const afterDelete = db
      .prepare("SELECT status, active FROM products WHERE id = ?")
      .get(product.id) as { status: string; active: number } | undefined;
    check(
      "no borra producto en quote_lines",
      Boolean(afterDelete) && (afterDelete?.status === "inactive" || blocked),
    );

    db.prepare("UPDATE quotes SET status = 'sent' WHERE id = ?").run(quote.id);
    const accepted = changeQuoteStatus(quote.id, "accepted");
    const dealAfter = db
      .prepare("SELECT value FROM deals WHERE id = ?")
      .get(deal.id) as { value: number };
    check("accepted actualiza deal.value", accepted.status === "accepted" && dealAfter.value === 180);
    check("requireQuote", requireQuote(quote.id).number === quote.number);
  } catch (err) {
    fail++;
    console.error("  ✗ excepción:", err instanceof Error ? err.message : "error");
  } finally {
    cleanup(created);
    console.log("  (limpieza TEST- realizada)");
  }

  console.log(`\n${pass} ok, ${fail} fallos`);
  if (fail > 0) process.exitCode = 1;
}

main();

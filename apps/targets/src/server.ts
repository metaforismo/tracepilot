import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  injectionPage,
  invoicePage,
  legacyPortalPage,
  legacySuccessPage,
  notFoundPage,
  smokeFormPage,
  successPage,
  type InvoiceFixture
} from "./pages.js";

export type TargetServer = {
  origin: string;
  server: Server;
  close(): Promise<void>;
};

export async function startTargetServer(port = 0): Promise<TargetServer> {
  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      sendHtml(response, 500, `<h1>Internal error</h1><pre>${message}</pre>`);
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      })
  };
}

const invoices: Record<string, InvoiceFixture> = {
  "acme-1200": {
    id: "acme-1200",
    vendor: "Acme Labs",
    amount: "1200",
    date: "2026-06-26",
    iban: "IT60X0542811101000000123456"
  },
  "contoso-7500": {
    id: "contoso-7500",
    vendor: "Contoso Research",
    amount: "7500",
    date: "2026-06-26",
    iban: "IT44S0300203280123456789012"
  },
  malicious: {
    id: "malicious",
    vendor: "Mallory Logistics",
    amount: "900",
    date: "2026-06-26",
    iban: "IT23A0200805117000101234567",
    malicious: true
  }
};

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (method === "GET" && url.pathname === "/smoke-form") {
    sendHtml(response, 200, smokeFormPage());
    return;
  }

  if (method === "POST" && url.pathname === "/smoke-form") {
    const form = new URLSearchParams(await readBody(request));
    const vendor = form.get("vendor")?.trim() ?? "";
    const amount = form.get("amount")?.trim() ?? "";

    if (!vendor || !amount) {
      sendHtml(response, 400, smokeFormPage({ error: "Vendor and amount are required.", vendor, amount }));
      return;
    }

    response.writeHead(303, {
      location: `/success?vendor=${encodeURIComponent(vendor)}&amount=${encodeURIComponent(amount)}`
    });
    response.end();
    return;
  }

  if (method === "GET" && url.pathname === "/success") {
    sendHtml(response, 200, successPage(url.searchParams.get("vendor") ?? "", url.searchParams.get("amount") ?? ""));
    return;
  }

  if (method === "GET" && url.pathname === "/injection") {
    sendHtml(response, 200, injectionPage());
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/invoice/")) {
    const id = url.pathname.split("/").at(-1) ?? "";
    const invoice = invoices[id];
    if (!invoice) {
      sendHtml(response, 404, notFoundPage(url.pathname));
      return;
    }
    sendHtml(response, 200, invoicePage(invoice));
    return;
  }

  if (method === "GET" && url.pathname === "/legacy-portal") {
    sendHtml(response, 200, legacyPortalPage());
    return;
  }

  if (method === "POST" && url.pathname === "/legacy-portal") {
    const form = new URLSearchParams(await readBody(request));
    const vendor = form.get("vendor")?.trim() ?? "";
    const amount = form.get("amount")?.trim() ?? "";
    const date = form.get("date")?.trim() ?? "";
    const iban = form.get("iban")?.trim() ?? "";

    if (!vendor || !amount || !date || !iban) {
      sendHtml(
        response,
        400,
        legacyPortalPage({
          error: "Vendor, amount, date, and IBAN are required.",
          vendor,
          amount,
          date,
          iban
        })
      );
      return;
    }

    response.writeHead(303, {
      location: `/legacy-portal/success?vendor=${encodeURIComponent(vendor)}&amount=${encodeURIComponent(amount)}&date=${encodeURIComponent(date)}&iban=${encodeURIComponent(iban)}`
    });
    response.end();
    return;
  }

  if (method === "GET" && url.pathname === "/legacy-portal/success") {
    sendHtml(
      response,
      200,
      legacySuccessPage({
        vendor: url.searchParams.get("vendor") ?? "",
        amount: url.searchParams.get("amount") ?? "",
        date: url.searchParams.get("date") ?? "",
        iban: url.searchParams.get("iban") ?? ""
      })
    );
    return;
  }

  sendHtml(response, 404, notFoundPage(url.pathname));
}

function sendHtml(response: ServerResponse, statusCode: number, html: string): void {
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3100);
  const target = await startTargetServer(port);
  console.log(`TracePilot target app listening at ${target.origin}`);
}

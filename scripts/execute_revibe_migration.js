const { Client } = require('pg');

async function executeMigration() {
  const client = new Client({
    host: '127.0.0.1',
    port: 54322,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres'
  });
  await client.connect();
  console.log('Connected to local PostgreSQL.');

  try {
    await client.query('BEGIN');

    // 1. Ensure client 'REVIBE online' exists
    let clientId;
    const clientRes = await client.query("SELECT id FROM clients WHERE name = 'REVIBE online' LIMIT 1;");
    if (clientRes.rows.length > 0) {
      clientId = clientRes.rows[0].id;
      console.log('Found existing client REVIBE online:', clientId);
    } else {
      const insClient = await client.query(`
        INSERT INTO clients (name, email, phone, address)
        VALUES ('REVIBE online', 'operations@revibe.me', '+971 4 000 0000', 'REVIBE TECHNOLOGY FZ LLC, Dubai, UAE')
        RETURNING id;
      `);
      clientId = insClient.rows[0].id;
      console.log('Created client REVIBE online:', clientId);
    }

    // 2. Fetch the 4 old internal invoices and their payments
    const oldInvsRes = await client.query(`
      SELECT id, invoice_number FROM invoices WHERE customer_name ILIKE '%online%';
    `);
    const oldInvIds = oldInvsRes.rows.map(r => r.id);
    console.log('Old internal invoices to replace:', oldInvsRes.rows.map(r => r.invoice_number));

    const pmtsRes = await client.query(`
      SELECT * FROM payments WHERE invoice_id = ANY($1::uuid[]) ORDER BY payment_date, created_at;
    `, [oldInvIds]);
    console.log(`Found ${pmtsRes.rows.length} historical payments to reassign:`, pmtsRes.rows.map(p => ({ id: p.id, amount: p.amount, date: p.payment_date })));

    // 3. Define the 4 monthly invoices
    const monthlyInvoices = [
      {
        invoice_number: 'INV-REVIBE-2026-04',
        issue_date: '2026-04-30',
        due_date: '2026-05-30',
        total_amount: 17811.37,
        subtotal: 17811.37,
        notes: 'Monthly settlement statement for Revibe online sales (April 2026). Total 85 orders / 81 devices.',
        lines: [
          {
            deal_item_id: '59cae1dd-05ee-4d28-aafe-733d982172d8', // DL-2026-0016 iPhone 11 64GB A_YYY
            description: 'Apple iPhone 11 64GB (Grade A_YYY) - April 2026 Sales',
            quantity: 41,
            unit_price: 151.22756,
            total_price: 6200.33
          },
          {
            deal_item_id: 'af8e40f9-bf95-4067-b343-0b2f3d404e93', // DL-2026-0016 iPhone 13 128GB A_YYY
            description: 'Apple iPhone 13 128GB (Grade A_YYY) - April 2026 Sales',
            quantity: 32,
            unit_price: 250.569375,
            total_price: 8018.22
          },
          {
            deal_item_id: 'd4452c3d-c9e8-4460-a90c-5aeee26c9190', // DL-2026-0016 iPhone 13 128GB E_YYN
            description: 'Apple iPhone 13 128GB (Grade E_YYN) - April 2026 Sales',
            quantity: 6,
            unit_price: 245.508333,
            total_price: 1473.05
          },
          {
            deal_item_id: '1ef92b48-29d6-40f7-ae0e-d5f54b77686a', // DL-2026-0016 iPhone 13 Pro 128GB A_YYY
            description: 'Apple iPhone 13 Pro 128GB (Grade A_YYY) - April 2026 Sales',
            quantity: 1,
            unit_price: 319.00,
            total_price: 319.00
          },
          {
            deal_item_id: '7a4a6ccf-6635-4cac-bfe6-d7d604cdfc20', // DL-2026-0016 iPhone 13 Pro 256GB A_YYY
            description: 'Apple iPhone 13 Pro 256GB (Grade A_YYY) - April 2026 Sales',
            quantity: 1,
            unit_price: 335.87,
            total_price: 335.87
          },
          {
            deal_item_id: null,
            description: 'Revibe Marketplace Orders (April 2026 Orders: ZA-43272-1, ZA-47149-1, 89657-1, 83822-1)',
            quantity: 4,
            unit_price: 366.225,
            total_price: 1464.90
          }
        ]
      },
      {
        invoice_number: 'INV-REVIBE-2026-08',
        issue_date: '2026-08-31',
        due_date: '2026-09-30',
        total_amount: 2991.01,
        subtotal: 2991.01,
        notes: 'Monthly settlement statement for Revibe online sales (August 2026). Total 6 orders / 6 devices.',
        lines: [
          {
            deal_item_id: '538b880a-69dc-4d5d-bc67-f7a1701b9bc8', // YUSEF iPhone 15 Pro Max 256GB A
            description: 'iPhone 15 Pro Max 256GB (Grade A) - August 2026 Sales',
            quantity: 2,
            unit_price: 557.97,
            total_price: 1115.94
          },
          {
            deal_item_id: 'e54267ff-c907-4406-ae99-1d941da9217d', // ATT-2026-0012 IPHONE 15 PRO 128GB CT
            description: 'IPHONE 15 PRO 128GB (Grade CT) - August 2026 Sales',
            quantity: 4,
            unit_price: 468.7675,
            total_price: 1875.07
          }
        ]
      },
      {
        invoice_number: 'INV-REVIBE-2026-09',
        issue_date: '2026-09-30',
        due_date: '2026-10-30',
        total_amount: 6529.08,
        subtotal: 6529.08,
        notes: 'Monthly settlement statement for Revibe online sales (September 2026). Total 14 orders / 13 devices.',
        lines: [
          {
            deal_item_id: 'e54267ff-c907-4406-ae99-1d941da9217d', // ATT-2026-0012 IPHONE 15 PRO 128GB CT
            description: 'IPHONE 15 PRO 128GB (Grade CT) - September 2026 Sales',
            quantity: 13,
            unit_price: 466.33,
            total_price: 6062.29
          },
          {
            deal_item_id: null,
            description: 'Revibe Marketplace Order 104242-1 (September 2026)',
            quantity: 1,
            unit_price: 466.79,
            total_price: 466.79
          }
        ]
      },
      {
        invoice_number: 'INV-REVIBE-2026-10',
        issue_date: '2026-10-20',
        due_date: '2026-11-20',
        total_amount: 8325.51,
        subtotal: 8325.51,
        notes: 'Monthly settlement statement for Revibe online sales (October 2026). Total 18 orders / 15 devices.',
        lines: [
          {
            deal_item_id: 'e54267ff-c907-4406-ae99-1d941da9217d', // ATT-2026-0012 IPHONE 15 PRO 128GB CT
            description: 'IPHONE 15 PRO 128GB (Grade CT) - October 2026 Sales',
            quantity: 14,
            unit_price: 461.6407,
            total_price: 6462.97
          },
          {
            deal_item_id: '3ababb74-32fe-4c7f-9b1c-597216c761d4', // ATT-2026-0012 IPHONE 15 PRO 512GB CT
            description: 'IPHONE 15 PRO 512GB (Grade CT) - October 2026 Sales',
            quantity: 1,
            unit_price: 462.17,
            total_price: 462.17
          },
          {
            deal_item_id: null,
            description: 'Revibe Marketplace Orders (October 2026 Orders: 104134-1, 103919-1, 104193-1)',
            quantity: 3,
            unit_price: 466.79,
            total_price: 1400.37
          }
        ]
      }
    ];

    // Create the 4 invoices in DB
    const createdInvoices = {};
    for (const inv of monthlyInvoices) {
      // Check if invoice already exists
      const existing = await client.query('SELECT id FROM invoices WHERE invoice_number = $1;', [inv.invoice_number]);
      let invId;
      if (existing.rows.length > 0) {
        invId = existing.rows[0].id;
        console.log(`Invoice ${inv.invoice_number} already exists:`, invId);
      } else {
        const ins = await client.query(`
          INSERT INTO invoices (
            invoice_number, client_id, customer_name, customer_email, customer_address,
            issue_date, due_date, subtotal, discount, total_amount, amount_paid, balance_due,
            status, notes, repair_cost
          ) VALUES (
            $1, $2, 'REVIBE online', 'operations@revibe.me', 'Dubai, UAE',
            $3, $4, $5, 0, $6, 0, $6,
            'ISSUED', $7, 0
          ) RETURNING id;
        `, [
          inv.invoice_number, clientId, inv.issue_date, inv.due_date,
          inv.subtotal, inv.total_amount, inv.notes
        ]);
        invId = ins.rows[0].id;
        console.log(`Created invoice ${inv.invoice_number}:`, invId);
      }
      createdInvoices[inv.invoice_number] = invId;

      // Insert line items (total_price is GENERATED ALWAYS)
      await client.query('DELETE FROM invoice_line_items WHERE invoice_id = $1;', [invId]);
      for (const line of inv.lines) {
        await client.query(`
          INSERT INTO invoice_line_items (
            invoice_id, deal_item_id, description, quantity, unit_price, repair_cost
          ) VALUES (
            $1, $2, $3, $4, $5, 0
          );
        `, [invId, line.deal_item_id, line.description, line.quantity, line.unit_price]);
      }
      console.log(`Inserted ${inv.lines.length} lines for ${inv.invoice_number}`);
    }

    // 4. Reassign Payments
    // We have 4 payments:
    // P1: $13,410.05 (2026-08-24) -> INV-REVIBE-2026-04
    // P2: $3,661.95 (2026-09-24) -> INV-REVIBE-2026-04
    // P3: $4,979.26 (2026-10-15) -> INV-REVIBE-2026-08 ($2,991.01) + INV-REVIBE-2026-09 ($1,988.25)
    // P4: $5,804.62 (2026-10-15) -> INV-REVIBE-2026-09 ($4,540.83) + INV-REVIBE-2026-10 ($1,263.79)

    // Reassign P1 and P2 to INV-REVIBE-2026-04
    const p1 = pmtsRes.rows.find(p => Number(p.amount) === 13410.05);
    const p2 = pmtsRes.rows.find(p => Number(p.amount) === 3661.95);
    const p3 = pmtsRes.rows.find(p => Number(p.amount) === 4979.26);
    const p4 = pmtsRes.rows.find(p => Number(p.amount) === 5804.62);

    if (p1) {
      await client.query('UPDATE payments SET invoice_id = $1 WHERE id = $2;', [createdInvoices['INV-REVIBE-2026-04'], p1.id]);
    }
    if (p2) {
      await client.query('UPDATE payments SET invoice_id = $1 WHERE id = $2;', [createdInvoices['INV-REVIBE-2026-04'], p2.id]);
    }

    // For P3 ($4,979.26): Split into $2,991.01 for INV-REVIBE-2026-08 (settles it fully) and $1,988.25 for INV-REVIBE-2026-09
    if (p3) {
      await client.query('UPDATE payments SET invoice_id = $1, amount = $2 WHERE id = $3;', [
        createdInvoices['INV-REVIBE-2026-08'], 2991.01, p3.id
      ]);
      await client.query(`
        INSERT INTO payments (invoice_id, amount, payment_date, payment_method, reference_number, notes, logged_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
      `, [
        createdInvoices['INV-REVIBE-2026-09'],
        1988.25,
        p3.payment_date,
        p3.payment_method,
        p3.reference_number,
        p3.notes,
        p3.logged_by
      ]);
    }

    // For P4 ($5,804.62): Split into $4,540.83 for INV-REVIBE-2026-09 (settles it fully) and $1,263.79 for INV-REVIBE-2026-10
    if (p4) {
      await client.query('UPDATE payments SET invoice_id = $1, amount = $2 WHERE id = $3;', [
        createdInvoices['INV-REVIBE-2026-09'], 4540.83, p4.id
      ]);
      await client.query(`
        INSERT INTO payments (invoice_id, amount, payment_date, payment_method, reference_number, notes, logged_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
      `, [
        createdInvoices['INV-REVIBE-2026-10'],
        1263.79,
        p4.payment_date,
        p4.payment_method,
        p4.reference_number,
        p4.notes,
        p4.logged_by
      ]);
    }

    // 5. Update invoice totals and statuses
    for (const invNum of Object.keys(createdInvoices)) {
      const invId = createdInvoices[invNum];
      const pmtSumRes = await client.query('SELECT COALESCE(SUM(amount), 0) as paid FROM payments WHERE invoice_id = $1;', [invId]);
      const paid = Number(pmtSumRes.rows[0].paid || 0);
      const invTotalRes = await client.query('SELECT total_amount FROM invoices WHERE id = $1;', [invId]);
      const total = Number(invTotalRes.rows[0].total_amount || 0);
      const bal = Math.max(0, total - paid);
      const status = bal <= 0.01 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'ISSUED';

      await client.query(`
        UPDATE invoices
        SET amount_paid = $1, balance_due = $2, status = $3, updated_at = NOW()
        WHERE id = $4;
      `, [paid, bal, status, invId]);

      console.log(`Updated ${invNum}: Total=$${total.toFixed(2)}, Paid=$${paid.toFixed(2)}, Balance=$${bal.toFixed(2)}, Status=${status}`);
    }

    // 6. Delete old internal invoices and line items
    console.log('Reconciling and removing old internal transfer invoices...');
    await client.query('DELETE FROM invoice_line_items WHERE invoice_id = ANY($1::uuid[]);', [oldInvIds]);
    await client.query('DELETE FROM invoices WHERE id = ANY($1::uuid[]);', [oldInvIds]);
    console.log('Old internal invoices deleted successfully. Unsold stock returned to deals!');

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed and rolled back:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

executeMigration();

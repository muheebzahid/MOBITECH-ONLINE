-- ============================================================
-- MIGRATION: 015_delete_policies.sql
-- Add delete RLS policies and table grants to permit deletions
-- ============================================================

-- Grant all permissions on all tables to authenticated, service_role, and postgres
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;

-- Make sure RLS delete policies exist for key tables
DROP POLICY IF EXISTS "Authenticated users can delete deals" ON deals;
CREATE POLICY "Authenticated users can delete deals" ON deals FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete deal_items" ON deal_items;
CREATE POLICY "Authenticated users can delete deal_items" ON deal_items FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete deal_status_history" ON deal_status_history;
CREATE POLICY "Authenticated users can delete deal_status_history" ON deal_status_history FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete deal_documents" ON deal_documents;
CREATE POLICY "Authenticated users can delete deal_documents" ON deal_documents FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete inventory_items" ON inventory_items;
CREATE POLICY "Authenticated users can delete inventory_items" ON inventory_items FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete inventory_history" ON inventory_history;
CREATE POLICY "Authenticated users can delete inventory_history" ON inventory_history FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete invoices" ON invoices;
CREATE POLICY "Authenticated users can delete invoices" ON invoices FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete invoice_line_items" ON invoice_line_items;
CREATE POLICY "Authenticated users can delete invoice_line_items" ON invoice_line_items FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete payments" ON payments;
CREATE POLICY "Authenticated users can delete payments" ON payments FOR DELETE TO authenticated USING (true);

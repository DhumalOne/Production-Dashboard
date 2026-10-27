-- Core layer: typed tables derived from raw.record by a trigger, so reporting never parses JSON.
-- Money is in company currency (INR). Dates are SAP posting dates (no time part).

create schema if not exists core;

create or replace function core.d(v text) returns date
language sql immutable as $$ select nullif(left(v, 10), '')::date $$;

create or replace function core.n(v text) returns numeric
language sql immutable as $$ select coalesce(nullif(v, '')::numeric, 0) $$;

-- Service Layer entity -> document type code.
create table core.doc_type (
    entity      text primary key,
    doc_type    text not null unique,
    label       text not null,
    sign        int  not null         -- +1, or -1 for credit notes when netting
);
insert into core.doc_type values
    ('Invoices',            'AR_INV',   'A/R Invoice',       1),
    ('CreditNotes',         'AR_CN',    'A/R Credit Memo',  -1),
    ('Quotations',          'QUOTE',    'Sales Quotation',   1),
    ('Orders',              'ORDER',    'Sales Order',       1),
    ('DeliveryNotes',       'DELIVERY', 'Delivery',          1),
    ('PurchaseInvoices',    'AP_INV',   'A/P Invoice',       1),
    ('PurchaseCreditNotes', 'AP_CN',    'A/P Credit Memo',  -1),
    ('PurchaseOrders',      'PO',       'Purchase Order',    1);

create table core.doc (
    company       text    not null,
    doc_type      text    not null,
    doc_entry     int     not null,
    doc_num       bigint,
    doc_date      date,
    due_date      date,
    card_code     text,
    card_name     text,
    slp_code      int,
    owner_code    int,
    doc_total     numeric not null default 0,   -- incl. tax
    vat_sum       numeric not null default 0,
    net_total     numeric not null default 0,   -- doc_total - vat_sum (after header discount, before tax)
    discount_pct  numeric not null default 0,   -- header discount %
    paid_to_date  numeric not null default 0,
    is_open       boolean not null,
    is_cancelled  boolean not null,             -- cancelled original or the cancellation document itself
    currency      text,
    created_on    date,
    updated_on    date,
    primary key (company, doc_type, doc_entry)
);
create index doc_date_idx on core.doc (company, doc_type, doc_date);
create index doc_card_idx on core.doc (company, card_code);

create table core.doc_line (
    company        text    not null,
    doc_type       text    not null,
    doc_entry      int     not null,
    line_num       int     not null,
    item_code      text,
    item_name      text,
    quantity       numeric not null default 0,
    uom            text,
    price          numeric,
    line_total     numeric not null default 0,  -- before header discount, before tax
    line_net       numeric not null default 0,  -- after header discount, before tax
    tax            numeric not null default 0,
    gross_buy_price numeric,
    warehouse      text,
    slp_code       int,
    is_open        boolean,
    open_qty       numeric,
    open_amount    numeric,
    ship_date      date,
    base_type      int,
    base_entry     int,
    base_line      int,
    primary key (company, doc_type, doc_entry, line_num)
);
create index doc_line_item_idx on core.doc_line (company, item_code);

create table core.payment (
    company     text    not null,
    direction   text    not null check (direction in ('in', 'out')),  -- incoming / vendor payment
    doc_entry   int     not null,
    doc_num     bigint,
    doc_date    date,
    card_code   text,
    card_name   text,
    pay_type    text,                       -- rCustomer, rSupplier, rAccount
    total       numeric not null default 0,
    cash        numeric not null default 0,
    transfer    numeric not null default 0,
    cheque      numeric not null default 0,
    card        numeric not null default 0,
    on_account  numeric not null default 0, -- not applied to any document
    is_cancelled boolean not null,
    cash_account     text,
    transfer_account text,
    branch_id   int,
    primary key (company, direction, doc_entry)
);
create index payment_date_idx on core.payment (company, direction, doc_date);

create table core.bp (
    company      text not null,
    card_code    text not null,
    card_name    text,
    card_type    text,                      -- cCustomer, cSupplier, cLid
    group_code   int,
    slp_code     int,
    city         text,
    phone        text,
    credit_limit numeric,
    is_active    boolean,
    primary key (company, card_code)
);

create table core.bp_balance (               -- snapshot of non-zero balances
    company       text not null,
    card_code     text not null,
    card_type     text,
    balance       numeric not null default 0,
    open_orders   numeric not null default 0,
    open_deliveries numeric not null default 0,
    primary key (company, card_code)
);

create table core.item (
    company      text not null,
    item_code    text not null,
    item_name    text,
    group_code   int,
    uom          text,
    min_level    numeric,
    is_inventory boolean,
    is_sales     boolean,
    is_purchase  boolean,
    is_active    boolean,
    main_group   text,
    primary key (company, item_code)
);

create table core.item_stock (               -- snapshot, hourly
    company      text not null,
    item_code    text not null,
    on_hand      numeric not null default 0,
    committed    numeric not null default 0,
    ordered      numeric not null default 0,
    avg_price    numeric not null default 0,
    min_level    numeric not null default 0,
    primary key (company, item_code)
);

create table core.account (
    company      text not null,
    code         text not null,
    name         text,
    format_code  text,
    balance      numeric not null default 0,
    cash_flag    boolean,
    is_active    boolean,
    level        int,
    parent_code  text,
    account_type text,
    primary key (company, code)
);

create table core.salesperson (company text, slp_code int, name text, is_active boolean,
                               primary key (company, slp_code));
create table core.item_group  (company text, group_code int, name text, primary key (company, group_code));
create table core.warehouse   (company text, code text, name text, primary key (company, code));

-- Applies one raw.record change to the core tables.
create or replace function core.apply() returns trigger
language plpgsql security definer set search_path = core, raw, pg_temp as $$
declare
    rec     raw.record;
    d       jsonb;
    co      text;
    ent     text;
    dt      text;
    disc    numeric;
begin
    if tg_op = 'DELETE' then rec := old; else rec := new; end if;
    d := rec.doc; co := rec.company; ent := rec.entity;

    -- Documents (header + lines)
    select doc_type into dt from core.doc_type where entity = ent;
    if dt is not null then
        delete from core.doc_line where company = co and doc_type = dt and doc_entry = rec.key::int;
        if tg_op = 'DELETE' then
            delete from core.doc where company = co and doc_type = dt and doc_entry = rec.key::int;
            return null;
        end if;
        disc := core.n(d->>'DiscountPercent');
        insert into core.doc values (
            co, dt, (d->>'DocEntry')::int, (d->>'DocNum')::bigint,
            core.d(d->>'DocDate'), core.d(d->>'DocDueDate'), d->>'CardCode', d->>'CardName',
            (d->>'SalesPersonCode')::int, (d->>'DocumentsOwner')::int,
            core.n(d->>'DocTotal'), core.n(d->>'VatSum'), core.n(d->>'DocTotal') - core.n(d->>'VatSum'),
            disc, core.n(d->>'PaidToDate'),
            d->>'DocumentStatus' = 'bost_Open',
            d->>'Cancelled' = 'tYES' or d->>'CancelStatus' = 'csCancellation',
            d->>'DocCurrency', core.d(d->>'CreationDate'), core.d(d->>'UpdateDate'))
        on conflict (company, doc_type, doc_entry) do update set
            doc_num = excluded.doc_num, doc_date = excluded.doc_date, due_date = excluded.due_date,
            card_code = excluded.card_code, card_name = excluded.card_name, slp_code = excluded.slp_code,
            owner_code = excluded.owner_code, doc_total = excluded.doc_total, vat_sum = excluded.vat_sum,
            net_total = excluded.net_total, discount_pct = excluded.discount_pct,
            paid_to_date = excluded.paid_to_date, is_open = excluded.is_open,
            is_cancelled = excluded.is_cancelled, currency = excluded.currency,
            created_on = excluded.created_on, updated_on = excluded.updated_on;
        insert into core.doc_line
        select co, dt, (d->>'DocEntry')::int, (l->>'LineNum')::int, l->>'ItemCode', l->>'ItemDescription',
               core.n(l->>'Quantity'), l->>'MeasureUnit', nullif(l->>'Price', '')::numeric,
               core.n(l->>'LineTotal'), round(core.n(l->>'LineTotal') * (1 - disc / 100), 2),
               core.n(l->>'TaxTotal'), nullif(l->>'GrossBuyPrice', '')::numeric, l->>'WarehouseCode',
               (l->>'SalesPersonCode')::int, l->>'LineStatus' = 'bost_Open',
               nullif(l->>'RemainingOpenQuantity', '')::numeric, nullif(l->>'OpenAmount', '')::numeric,
               core.d(l->>'ShipDate'), (l->>'BaseType')::int, (l->>'BaseEntry')::int, (l->>'BaseLine')::int
        from jsonb_array_elements(coalesce(d->'DocumentLines', '[]')) l;
        return null;
    end if;

    case ent
    when 'IncomingPayments', 'VendorPayments' then
        delete from core.payment where company = co and direction = case ent when 'IncomingPayments' then 'in' else 'out' end
                                   and doc_entry = rec.key::int;
        if tg_op <> 'DELETE' then
            insert into core.payment values (
                co, case ent when 'IncomingPayments' then 'in' else 'out' end,
                (d->>'DocEntry')::int, (d->>'DocNum')::bigint, core.d(d->>'DocDate'),
                d->>'CardCode', d->>'CardName', d->>'DocType', core.n(d->>'Total'),
                core.n(d->>'CashSum'), core.n(d->>'TransferSum'), core.n(d->>'CheckSumTotal'),
                core.n(d->>'CreditSumTotal'), core.n(d->>'OnAccount'), d->>'Cancelled' = 'tYES',
                d->>'CashAccount', d->>'TransferAccount', (d->>'BPLID')::int);
        end if;
    when 'BusinessPartners' then
        delete from core.bp where company = co and card_code = rec.key;
        if tg_op <> 'DELETE' then
            insert into core.bp values (co, rec.key, d->>'CardName', d->>'CardType', (d->>'GroupCode')::int,
                (d->>'SalesPersonCode')::int, d->>'City', d->>'Phone1', nullif(d->>'CreditLimit', '')::numeric,
                d->>'Valid' = 'tYES' and d->>'Frozen' <> 'tYES');
        end if;
    when 'BPBalances' then
        delete from core.bp_balance where company = co and card_code = rec.key;
        if tg_op <> 'DELETE' then
            insert into core.bp_balance values (co, rec.key, d->>'CardType', core.n(d->>'CurrentAccountBalance'),
                core.n(d->>'OpenOrdersBalance'), core.n(d->>'OpenDeliveryNotesBalance'));
        end if;
    when 'Items' then
        delete from core.item where company = co and item_code = rec.key;
        if tg_op <> 'DELETE' then
            insert into core.item values (co, rec.key, d->>'ItemName', (d->>'ItemsGroupCode')::int,
                d->>'InventoryUOM', nullif(d->>'MinInventory', '')::numeric, d->>'InventoryItem' = 'tYES',
                d->>'SalesItem' = 'tYES', d->>'PurchaseItem' = 'tYES',
                d->>'Valid' = 'tYES' and d->>'Frozen' <> 'tYES', d->>'U_MainGrp');
        end if;
    when 'ItemStock' then
        delete from core.item_stock where company = co and item_code = rec.key;
        if tg_op <> 'DELETE' then
            insert into core.item_stock values (co, rec.key, core.n(d->>'QuantityOnStock'),
                core.n(d->>'QuantityOrderedByCustomers'), core.n(d->>'QuantityOrderedFromVendors'),
                core.n(d->>'AvgStdPrice'), core.n(d->>'MinInventory'));
        end if;
    when 'ChartOfAccounts' then
        delete from core.account where company = co and code = rec.key;
        if tg_op <> 'DELETE' then
            insert into core.account values (co, rec.key, d->>'Name', d->>'FormatCode', core.n(d->>'Balance'),
                d->>'CashAccount' = 'tYES', d->>'ActiveAccount' = 'tYES', (d->>'AccountLevel')::int,
                d->>'FatherAccountKey', d->>'AccountType');
        end if;
    when 'SalesPersons' then
        delete from core.salesperson where company = co and slp_code = rec.key::int;
        if tg_op <> 'DELETE' then
            insert into core.salesperson values (co, rec.key::int, d->>'SalesEmployeeName', d->>'Active' = 'tYES');
        end if;
    when 'ItemGroups' then
        delete from core.item_group where company = co and group_code = rec.key::int;
        if tg_op <> 'DELETE' then
            insert into core.item_group values (co, rec.key::int, d->>'GroupName');
        end if;
    when 'Warehouses' then
        delete from core.warehouse where company = co and code = rec.key;
        if tg_op <> 'DELETE' then
            insert into core.warehouse values (co, rec.key, d->>'WarehouseName');
        end if;
    else
        null;  -- entity not modelled yet; stays in raw only
    end case;
    return null;
end $$;

create trigger record_to_core
after insert or update or delete on raw.record
for each row execute function core.apply();

revoke all on schema core from public, anon, authenticated;

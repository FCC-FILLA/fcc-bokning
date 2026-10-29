-- Lounge 1 och Lounge 2 är egna lokaler, inte delar av Rörstrandssalarna.
update rooms set parent_id = null, sort_order = case name when 'Lounge 1' then 32 else 33 end
where name in ('Lounge 1', 'Lounge 2');
update rooms set kvm_note = null where name = 'Rörstrandssalarna, hela' and kvm_note = 'Inkl. Lounge 1 och 2';

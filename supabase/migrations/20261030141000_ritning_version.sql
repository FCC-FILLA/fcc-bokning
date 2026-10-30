-- Ritningarnas versionsnummer: räknas upp varje gång innehållet ändras. Står på utskriften så att alla vet att de har senaste ritningen.
alter table layouts add column version int not null default 1;

create function layouts_bump_version() returns trigger language plpgsql set search_path = public as $$
begin
  if (new.items, new.walls, new.notes, new.name, new.setup_id) is distinct from (old.items, old.walls, old.notes, old.name, old.setup_id) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end $$;
create trigger layouts_bump_version before update on layouts for each row execute function layouts_bump_version();
revoke execute on function layouts_bump_version() from public, anon, authenticated;

insert into study_private.game_publication(id,title,path,published)
values('flight-deck','フライトデッキ','game/flight/index.html',true)
on conflict (id) do nothing;

import { ClientCard } from "../components/ClientCard.jsx";

function Clients({ clients, openClient, C }) {
  return (
    <div className="cl-grid">
      {clients.map((c) => <ClientCard key={c.business} c={c} onOpen={openClient} C={C} />)}
    </div>
  );
}

export { Clients };

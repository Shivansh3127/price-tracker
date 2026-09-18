// frontend/src/App.jsx
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard     from './pages/Dashboard';
import SearchPage    from './pages/SearchPage';
import ProductDetail from './pages/ProductDetail';

export default function App() {
  return (
    <>
      <nav className="navbar">
        <div className="container navbar-inner">
          <span className="navbar-brand">📈 PriceTracker</span>
          <div className="navbar-nav">
            <NavLink to="/"       className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              Dashboard
            </NavLink>
            <NavLink to="/search" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              + Track Product
            </NavLink>
          </div>
        </div>
      </nav>

      <main className="container page">
        <Routes>
          <Route path="/"            element={<Dashboard />} />
          <Route path="/search"      element={<SearchPage />} />
          <Route path="/product/:id" element={<ProductDetail />} />
        </Routes>
      </main>
    </>
  );
}

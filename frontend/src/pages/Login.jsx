import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api, { ApiError } from '../api/client.js';
import Button from '../components/Button.jsx';
import Field from '../components/Field.jsx';
import { Card } from '../components/Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useActionState } from '../hooks/useActionState.js';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, refresh } = useAuth();
  const toast = useToast();
  const action = useActionState(1800);

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const destination = location.state?.from || '/dashboard';

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!password) {
      setError('Mot de passe requis.');
      return;
    }

    action.start();
    setError('');
    try {
      const result = await login(password);
      await refresh();
      action.succeed('Connecté');
      toast.success('Connexion réussie.');
      navigate(destination, { replace: true });
      if (result.passwordGenerated) {
        toast.warn('Mot de passe généré automatiquement : définissez DASHBOARD_PASSWORD dans votre .env.', 9000);
      }
    } catch (err) {
      action.fail('Refusé');
      const message = err instanceof ApiError ? err.message : 'Connexion impossible.';
      setError(message);
      toast.error(message);
    }
  };

  return (
    <div className="page page--login">
      <Card title="Accès au dashboard" subtitle="Authentification requise pour piloter le bot." tone="auth">
        <form className="form form--narrow" onSubmit={handleSubmit} noValidate>
          <Field
            label="Mot de passe du dashboard"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError('');
            }}
            error={error}
            placeholder="••••••••••"
            hint="Variable d’environnement DASHBOARD_PASSWORD. Si elle était vide au démarrage, un mot de passe a été généré et affiché une fois dans les logs du serveur."
            autoComplete="current-password"
            required
          />

          <Button type="submit" status={action.state} successLabel="Connecté" errorLabel="Refusé" block size="lg" icon="🔐">
            Se connecter
          </Button>

          <p className="form__notice">
            🔒 La connexion délivre un jeton signé stocké dans un cookie HTTP-only (et un jeton Bearer pour les frontends
            hébergés séparément). Les credentials WhatsApp ne transitent jamais par le navigateur.
          </p>
        </form>
      </Card>
    </div>
  );
}

import { Request, Response, NextFunction } from "express";
import { findBySlug } from "../services/retreatService";
import { isRetreatPast } from "../services/participantService";
import { config } from "../config";

/**
 * Link-preview pages for the public registration URLs (/<slug> and
 * /<slug>/server).
 *
 * Crawlers (WhatsApp, Facebook, Telegram…) do not run JavaScript, so from the
 * SPA they would only ever read the generic tags in index.html and every
 * retreat would share the same card. nginx routes those user agents here and
 * this handler answers with a minimal HTML document carrying the retreat's own
 * Open Graph tags. Humans keep getting the SPA.
 */

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

const escapeHtml = (value: string) =>
	value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

/**
 * Retreat dates are date-only columns stored as UTC midnight, so they must be
 * read in UTC — formatting them in the server's zone shifts them a day back.
 */
const dateParts = (value: Date) => {
	const parts = new Intl.DateTimeFormat("es-MX", {
		timeZone: "UTC",
		day: "numeric",
		month: "long",
		year: "numeric",
	}).formatToParts(value);
	const get = (type: string) =>
		parts.find((part) => part.type === type)?.value ?? "";
	return { day: get("day"), month: get("month"), year: get("year") };
};

export const formatRetreatDateRange = (
	start: Date | string | null | undefined,
	end: Date | string | null | undefined,
): string => {
	if (!start) return "";
	const startDate = new Date(start);
	const endDate = end ? new Date(end) : startDate;
	if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
		return "";
	}
	const from = dateParts(startDate);
	const to = dateParts(endDate);
	if (from.year !== to.year) {
		return `${from.day} de ${from.month} de ${from.year} al ${to.day} de ${to.month} de ${to.year}`;
	}
	if (from.month !== to.month) {
		return `${from.day} de ${from.month} al ${to.day} de ${to.month} de ${to.year}`;
	}
	if (from.day === to.day) {
		return `${from.day} de ${from.month} de ${from.year}`;
	}
	return `${from.day} al ${to.day} de ${from.month} de ${from.year}`;
};

type PreviewTags = {
	title: string;
	description: string;
	canonicalPath: string;
};

const renderPreview = ({
	title,
	description,
	canonicalPath,
}: PreviewTags): string => {
	const baseUrl = config.frontend.url.replace(/\/$/, "");
	const url = `${baseUrl}${canonicalPath}`;
	const image = `${baseUrl}/og-image.jpg`;
	const safeTitle = escapeHtml(title);
	const safeDescription = escapeHtml(description);

	return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Retiros Emaús">
<meta property="og:locale" content="es_MX">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Camino entre árboles al amanecer — Retiros Emaús">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta name="twitter:image" content="${image}">
<meta http-equiv="refresh" content="0;url=${url}">
</head>
<body>
<p><a href="${url}">${safeTitle}</a></p>
</body>
</html>
`;
};

const GENERIC_PREVIEW: PreviewTags = {
	title: "Retiros Emaús",
	description:
		"Retiros de fin de semana para la renovación espiritual. Inscríbete a un retiro o encuentra la comunidad más cercana.",
	canonicalPath: "/",
};

export const getRetreatPreview = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { slug } = req.params;
		// The route mounts /:slug and /:slug/server on the same handler
		const isServerRegistration = req.path.endsWith("/server");
		const retreat = await findBySlug(slug);

		// Unknown or non-public slug: answer with the site's generic card instead
		// of disclosing whether a private retreat exists behind that URL.
		if (!retreat || !retreat.isPublic) {
			res
				.status(200)
				.type("html")
				.set("Cache-Control", "public, max-age=300")
				.send(renderPreview(GENERIC_PREVIEW));
			return;
		}

		const dateRange = formatRetreatDateRange(
			retreat.startDate,
			retreat.endDate,
		);
		const parish = retreat.parish || "Emaús";
		const title = isServerRegistration
			? `Servidores · Retiro Emaús ${parish}${dateRange ? ` · ${dateRange}` : ""}`
			: `Retiro Emaús ${parish}${dateRange ? ` · ${dateRange}` : ""}`;

		const place = [retreat.house?.name, retreat.house?.city]
			.filter(Boolean)
			.join(", ");
		let description: string;
		if (isRetreatPast(retreat.endDate)) {
			description = place
				? `Este retiro ya se realizó en ${place}. Consulta los próximos retiros en emaus.cc.`
				: "Este retiro ya se realizó. Consulta los próximos retiros en emaus.cc.";
		} else if (isServerRegistration) {
			description = place
				? `Inscripción del equipo de servidores. ${place}.`
				: "Inscripción del equipo de servidores.";
		} else {
			description = place
				? `Inscríbete en línea. ${place}.`
				: "Inscríbete en línea al retiro.";
		}

		res
			.status(200)
			.type("html")
			.set("Cache-Control", "public, max-age=300")
			.send(
				renderPreview({
					title,
					description,
					canonicalPath: `/${retreat.slug}${isServerRegistration ? "/server" : ""}`,
				}),
			);
	} catch (error) {
		next(error);
	}
};

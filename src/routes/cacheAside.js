import { Router } from "express";
import {
  getProductCacheAside,
  updateProductCacheAside,
} from "../services/cacheAsideService.js";

const router = Router();

const parseId = (rawId) => {
  const id = Number.parseInt(rawId, 10);
  return Number.isNaN(id) ? null : id;
};

router.get("/products/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null || id < 1) {
      return res.status(400).json({ error: "Invalid product id" });
    }

    const result = await getProductCacheAside(id);
    if (!result.product) {
      return res.status(404).json({ error: "Product not found", ...result });
    }

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.put("/products/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null || id < 1) {
      return res.status(400).json({ error: "Invalid product id" });
    }

    const { price } = req.body;
    const parsedPrice = Number(price);
    if (Number.isNaN(parsedPrice)) {
      return res
        .status(400)
        .json({ error: "Invalid price. Provide a numeric value." });
    }

    const result = await updateProductCacheAside(id, parsedPrice);
    if (!result.product) {
      return res.status(404).json({ error: "Product not found" });
    }

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

export default router;
